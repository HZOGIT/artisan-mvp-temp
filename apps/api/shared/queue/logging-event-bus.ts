import type { EventBusPort, DomainEvent } from "../ports/event-bus";
import type { DbClient } from "../db/client";
import { eventLog } from "../../../../drizzle/schema.pg";

export class LoggingEventBus implements EventBusPort {
  constructor(private readonly inner: EventBusPort, private readonly db: DbClient) {}

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    await this.insertOne(event);
    await this.inner.publish(event);
  }

  async publishMany<T>(events: readonly DomainEvent<T>[]): Promise<void> {
    await Promise.all(events.map((e) => this.insertOne(e)));
    await this.inner.publishMany(events);
  }

  private async insertOne<T>(event: DomainEvent<T>): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    await this.db.insert(eventLog).values({
      artisanId: typeof payload?.artisanId === "number" ? payload.artisanId : null,
      userId: null,
      entityType: event.aggregateType,
      entityId: parseInt(event.aggregateId, 10) || 0,
      action: event.type,
      payload: payload as object,
      occurredAt: event.occurredAt,
    });
  }
}

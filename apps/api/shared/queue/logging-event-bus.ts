import type { EventBusPort, DomainEvent } from "../ports/event-bus";
import type { DbClient } from "../db/client";
import { eventLog } from "../../../../drizzle/schema.pg";

export class LoggingEventBus implements EventBusPort {
  constructor(private readonly inner: EventBusPort, private readonly db: DbClient) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.insertOne(event);
    await this.inner.publish(event);
  }

  async publishMany(events: readonly DomainEvent[]): Promise<void> {
    await Promise.all(events.map((e) => this.insertOne(e)));
    await this.inner.publishMany(events);
  }

  private async insertOne(event: DomainEvent): Promise<void> {
    await this.db.insert(eventLog).values({
      artisanId: event.artisanId,
      userId: event.userId ?? null,
      entityType: event.aggregateType,
      entityId: event.aggregateId,
      action: event.type,
      payload: event.payload ?? null,
      occurredAt: event.occurredAt,
    });
  }
}

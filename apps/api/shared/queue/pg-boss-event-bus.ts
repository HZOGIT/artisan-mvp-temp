import type { PgBoss } from "pg-boss";
import type { EventBusPort, DomainEvent } from "../ports/event-bus";

export class PgBossEventBus implements EventBusPort {
  constructor(private readonly boss: PgBoss) {}

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    await this.boss.send(event.type, event as unknown as object);
  }

  async publishMany<T>(events: readonly DomainEvent<T>[]): Promise<void> {
    await Promise.all(events.map((e) => this.publish(e)));
  }
}

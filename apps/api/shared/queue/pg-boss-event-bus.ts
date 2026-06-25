import type { PgBoss } from "pg-boss";
import type { EventBusPort, DomainEvent } from "../ports/event-bus";

export class PgBossEventBus implements EventBusPort {
  constructor(private readonly boss: PgBoss) {}

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    await this.boss.send(event.type, event as unknown as object);
  }

  async publishMany<T>(events: readonly DomainEvent<T>[]): Promise<void> {
    const byType = new Map<string, DomainEvent<unknown>[]>();
    for (const e of events) {
      const group = byType.get(e.type);
      if (group) group.push(e as DomainEvent<unknown>);
      else byType.set(e.type, [e as DomainEvent<unknown>]);
    }
    await Promise.all(
      Array.from(byType.entries()).map(([type, group]) =>
        this.boss.insert(type, group.map((e) => ({ data: e as object })))
      )
    );
  }
}

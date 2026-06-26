import type { PgBoss } from "pg-boss";
import type { EventBusPort, DomainEvent } from "../ports/event-bus";

export class PgBossEventBus implements EventBusPort {
  constructor(private readonly boss: PgBoss) {}

  async publish(event: DomainEvent): Promise<void> {
    /* pg-boss v10+ : la queue doit exister avant send() (createQueue idempotent). */
    await this.boss.createQueue(event.type);
    await this.boss.send(event.type, event as unknown as object);
  }

  async publishMany(events: readonly DomainEvent[]): Promise<void> {
    const byType = new Map<string, DomainEvent[]>();
    for (const e of events) {
      const group = byType.get(e.type);
      if (group) group.push(e);
      else byType.set(e.type, [e]);
    }
    await Promise.all(
      Array.from(byType.entries()).map(async ([type, group]) => {
        await this.boss.createQueue(type);
        return this.boss.insert(type, group.map((e) => ({ data: e as object })));
      })
    );
  }
}

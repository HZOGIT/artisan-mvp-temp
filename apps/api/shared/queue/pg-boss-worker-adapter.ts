import type { PgBoss } from "pg-boss";
import type { Job } from "pg-boss";
import type { WorkerPort, DomainEvent } from "../ports/event-bus";

export class PgBossWorkerAdapter implements WorkerPort {
  constructor(private readonly boss: PgBoss) {}

  register(type: string, handler: (event: DomainEvent) => Promise<void>): void {
    /* pg-boss v10+ exige que la queue existe avant work() — createQueue est idempotent. */
    void this.boss
      .createQueue(type)
      .then(() =>
        this.boss.work(type, async (jobs: Job<DomainEvent>[]) => {
          await Promise.all(jobs.map((job) => handler(job.data)));
        }),
      )
      .catch((err: unknown) => {
        throw new Error(`[PgBossWorkerAdapter] Échec enregistrement worker "${type}" : ${String(err)}`);
      });
  }
}

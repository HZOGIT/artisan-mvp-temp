import { eq } from "drizzle-orm";
import { schedulerJobRuns } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../shared/db";
import type { IJobRunRepository, ClaimedRun } from "./job-run-repository";

/**
 * Implémentation Drizzle du repository de verrous scheduler.
 * Connexion directe (rôle owner) — pas de RLS, table infra globale.
 */
export class JobRunRepositoryDrizzle implements IJobRunRepository {
  constructor(private readonly db: DbClient) {}

  async tryClaimRun(jobName: string, periodKey: string, now: Date): Promise<ClaimedRun | null> {
    const rows = await this.db
      .insert(schedulerJobRuns)
      .values({ jobName, periodKey, status: "running", startedAt: now })
      .onConflictDoNothing({ target: [schedulerJobRuns.jobName, schedulerJobRuns.periodKey] })
      .returning({ id: schedulerJobRuns.id });
    return rows[0] ? { id: rows[0].id } : null;
  }

  async markDone(id: number, completedAt: Date): Promise<void> {
    await this.db
      .update(schedulerJobRuns)
      .set({ status: "done", completedAt })
      .where(eq(schedulerJobRuns.id, id));
  }

  async markFailed(id: number, completedAt: Date, errorMessage: string): Promise<void> {
    await this.db
      .update(schedulerJobRuns)
      .set({ status: "failed", completedAt, errorMessage: errorMessage.slice(0, 500) })
      .where(eq(schedulerJobRuns.id, id));
  }
}

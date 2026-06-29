import type { IJobRunRepository } from "./job-run-repository";
import type { JobDefinition, JobRunResult } from "./scheduler-types";

/**
 * Tente d'exécuter un job avec idempotence partagée.
 * "skipped" = une autre instance a déjà pris (ou terminé) ce tick.
 */
export async function runJob(
  repo: IJobRunRepository,
  job: JobDefinition,
  now = new Date(),
): Promise<JobRunResult> {
  const period = job.periodKey(now);
  const claimed = await repo.tryClaimRun(job.name, period, now);
  if (!claimed) return "skipped";

  const completedAt = new Date();
  try {
    await job.run();
    await repo.markDone(claimed.id, completedAt);
    return "done";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await repo.markFailed(claimed.id, completedAt, msg);
    return "failed";
  }
}

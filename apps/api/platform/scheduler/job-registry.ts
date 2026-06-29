import type { IJobRunRepository } from "./job-run-repository";
import type { JobDefinition } from "./scheduler-types";
import { runJob } from "./scheduler-runner";

/**
 * Registre de jobs idempotents. Les modules métier appellent `register()`
 * pour brancher leurs jobs ; le worker dédié appelle `runAll()` à chaque tick.
 */
export class JobRegistry {
  private readonly jobs: JobDefinition[] = [];

  constructor(private readonly repo: IJobRunRepository) {}

  register(job: JobDefinition): void {
    this.jobs.push(job);
  }

  async runAll(now = new Date()): Promise<void> {
    await Promise.all(this.jobs.map((job) => runJob(this.repo, job, now)));
  }
}

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { JobRegistry } from "./job-registry";
import { JobRunRepositoryDrizzle } from "./job-run-repository-drizzle";
import type { DbClient } from "../../shared/db";

export interface SchedulerPluginOptions {
  readonly db: DbClient;
  readonly intervalMinutes?: number;
  readonly onCritical?: (msg: string) => void;
  readonly configure?: (registry: JobRegistry) => void;
}

/**
 * Plugin Fastify pour le scheduler découplé du HTTP.
 * Expose un `JobRegistry` configuré par les modules métier via `configure`.
 * Déclencheur : toad-scheduler (même pattern que billing-cron).
 */
export const schedulerPlugin = fp(
  (app: FastifyInstance, opts: SchedulerPluginOptions) => {
    const repo = new JobRunRepositoryDrizzle(opts.db);
    const registry = new JobRegistry(repo);

    opts.configure?.(registry);

    const intervalMinutes = opts.intervalMinutes ?? 5;

    const task = new AsyncTask(
      "scheduler-tick",
      async () => {
        await registry.runAll();
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        app.log.error({ event: "scheduler_tick_error", error: msg }, "Scheduler tick échoué");
        opts.onCritical?.(msg);
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ minutes: intervalMinutes, runImmediately: false }, task),
    );
  },
  { name: "scheduler-plugin", dependencies: ["@fastify/schedule"] },
);

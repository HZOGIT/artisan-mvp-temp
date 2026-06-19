import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { SchedulerDeps } from "../../modules/billing/application/billing-scheduler";
import { runSchedulerTick } from "../../modules/billing/application/billing-scheduler";
import type { DbClient } from "../db";

const LOCK_ID = BigInt("0xb111b111");

async function tryAdvisoryLock(db: DbClient, lockId: bigint): Promise<boolean> {
  const result = await db.execute(`SELECT pg_try_advisory_lock(${lockId}) AS acquired`);
  return (result.rows[0] as { acquired: boolean }).acquired === true;
}

async function releaseAdvisoryLock(db: DbClient, lockId: bigint): Promise<void> {
  await db.execute(`SELECT pg_advisory_unlock(${lockId})`);
}

export interface BillingCronOptions {
  readonly schedulerDeps: SchedulerDeps;
  readonly db: DbClient;
  /** Intervalle en minutes entre chaque tick (défaut : 60). */
  readonly intervalMinutes?: number;
}

export const billingCronPlugin = fp(
  async (app: FastifyInstance, opts: BillingCronOptions) => {
    const intervalMinutes = opts.intervalMinutes ?? 60;

    const task = new AsyncTask(
      "billing-tick",
      async () => {
        const locked = await tryAdvisoryLock(opts.db, LOCK_ID);
        if (!locked) {
          app.log.debug({ event: "billing_tick_skipped" }, "Billing tick skipped — autre réplica actif");
          return;
        }
        try {
          const result = await runSchedulerTick(opts.schedulerDeps);
          app.log.info({ event: "billing_tick_done", ...result }, "Billing tick terminé");
        } finally {
          await releaseAdvisoryLock(opts.db, LOCK_ID);
        }
      },
      (err) => {
        app.log.error({ event: "billing_tick_error", error: err instanceof Error ? err.message : String(err) }, "Billing tick échoué");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ minutes: intervalMinutes, runImmediately: false }, task),
    );
  },
  { name: "billing-cron" },
);

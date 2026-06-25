import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import pg from "pg";
import type { SchedulerDeps } from "../../modules/billing/application/billing-scheduler";
import { runSchedulerTick } from "../../modules/billing/application/billing-scheduler";
import type { DbClient } from "../db";

const LOCK_ID = BigInt("0xb111b111");
const SLOW_TICK_MS = 30_000;

export interface BillingCronOptions {
  readonly schedulerDeps: SchedulerDeps;
  readonly db: DbClient;
  /** Connection string du rôle applicatif — utilisée pour le verrou consultatif session-level. */
  readonly dbUrl: string;
  readonly intervalMinutes?: number;
  /**
   * Appelé si le tick échoue — brancher sur `log.fatal` pour déclencher une alerte BetterStack.
   */
  readonly onCritical?: (msg: string) => void;
}

export const billingCronPlugin = fp(
  (app: FastifyInstance, opts: BillingCronOptions) => {
    const intervalMinutes = opts.intervalMinutes ?? 60;

    const task = new AsyncTask(
      "billing-tick",
      async () => {
        /* ponytail: connexion dédiée hors pool — pg_try_advisory_lock session-level persiste pendant tout le tick */
        const client = new pg.Client({ connectionString: opts.dbUrl });
        await client.connect();
        const tickStart = Date.now();
        try {
          const { rows } = await client.query(
            `SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`,
          );
          if (!(rows[0] as { acquired: boolean }).acquired) {
            app.log.debug({ event: "billing_lock_skipped" }, "billing tick: lock not acquired, autre instance active");
            return;
          }
          try {
            const result = await runSchedulerTick(opts.schedulerDeps);
            const elapsed = Date.now() - tickStart;
            if (elapsed > SLOW_TICK_MS) {
              app.log.warn({ event: "billing_tick_slow", elapsed_ms: elapsed }, "Billing tick lent — appels Stripe dépassent 30s");
            }
            app.log.info({ event: "billing_tick_done", elapsed_ms: elapsed, ...result }, "Billing tick terminé");
          } finally {
            await client.query(`SELECT pg_advisory_unlock(${LOCK_ID})`);
          }
        } finally {
          await client.end();
        }
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        app.log.error({ event: "billing_tick_error", error: msg }, "Billing tick échoué");
        opts.onCritical?.(msg);
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ minutes: intervalMinutes, runImmediately: false }, task),
    );
  },
  { name: "billing-cron" },
);

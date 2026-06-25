import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { SchedulerDeps } from "../../modules/billing/application/billing-scheduler";
import { runSchedulerTick } from "../../modules/billing/application/billing-scheduler";
import type { DbClient } from "../db";

const LOCK_ID = BigInt("0xb111b111");
const SLOW_TICK_MS = 30_000;

export interface BillingCronOptions {
  readonly schedulerDeps: SchedulerDeps;
  readonly db: DbClient;
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
        /*
         * pg_advisory_xact_lock : lock transactionnel (même connexion garantie, unlock auto
         * en fin de transaction). Évite la race condition du lock session-level sur pool Drizzle.
         * ponytail: connexion tenue pendant runSchedulerTick (appels Stripe inclus) ;
         * passer à session-level lock + connexion dédiée si la latence Stripe devient un problème.
         */
        const tickStart = Date.now();
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "billing_tick_skipped" }, "Billing tick skipped — autre réplica actif");
            return;
          }
          const result = await runSchedulerTick(opts.schedulerDeps);
          const elapsed = Date.now() - tickStart;
          if (elapsed > SLOW_TICK_MS) {
            app.log.warn({ event: "billing_tick_slow", elapsed_ms: elapsed }, "Billing tick lent — connexion DB tenue pendant appels Stripe");
          }
          app.log.info({ event: "billing_tick_done", elapsed_ms: elapsed, ...result }, "Billing tick terminé");
        });
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

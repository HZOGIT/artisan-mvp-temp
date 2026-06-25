import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { IAlertesPrevisionsRepository } from "../../modules/alertes-previsions/application/alertes-previsions-repository";
import { runAlertesSchedulerTick } from "../../modules/alertes-previsions/application/alertes-previsions-scheduler";
import type { DbClient } from "../db";
import { artisans as artisansTable } from "../../../../drizzle/schema.pg";

const LOCK_ID = BigInt("0xa1e8a1e8");

export interface AlertesCronOptions {
  readonly repo: IAlertesPrevisionsRepository;
  /** APP_DATABASE_URL — advisory lock + listing artisans (table hors RLS, même pattern que notificationsCronPlugin). */
  readonly db: DbClient;
  readonly intervalMinutes?: number;
}

export const alertesPrevisionsCronPlugin = fp(
  (app: FastifyInstance, opts: AlertesCronOptions) => {
    const intervalMinutes = opts.intervalMinutes ?? 60;

    const task = new AsyncTask(
      "alertes-previsions-tick",
      async () => {
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "alertes_tick_skipped" }, "Alertes tick skipped — autre réplica actif");
            return;
          }
          const rows = await opts.db.select({ id: artisansTable.id }).from(artisansTable);
          const artisanIds = rows.map((r) => r.id);
          const result = await runAlertesSchedulerTick(opts.repo, artisanIds, new Date(), app.log);
          app.log.info({ event: "alertes_tick_done", ...result }, "Alertes prévisions tick terminé");
        });
      },
      (err) => {
        app.log.error({ event: "alertes_tick_error", error: err instanceof Error ? err.message : String(err) }, "Alertes tick échoué");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ minutes: intervalMinutes, runImmediately: false }, task),
    );
  },
  { name: "alertes-previsions-cron" },
);

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { DbClient } from "../db";

export interface NotificationsCronDeps {
  /** Génère rappels factures en retard pour TOUS les artisans (idempotent). */
  readonly generateOverdueReminders: () => Promise<{ rappelsCreated: number }>;
  /** Génère alertes stock bas pour TOUS les artisans. */
  readonly generateAlerts: () => Promise<{ alertsCreated: number }>;
}

export interface NotificationsCronOptions {
  readonly deps: NotificationsCronDeps;
  readonly db: DbClient;
  readonly intervalHours?: number;
}

const LOCK_ID = BigInt("0xb111b113");

export const notificationsCronPlugin = fp(
  (app: FastifyInstance, opts: NotificationsCronOptions) => {
    const intervalHours = opts.intervalHours ?? 1;

    const task = new AsyncTask(
      "notifications-tick",
      async () => {
        /*
         * pg_advisory_xact_lock : lock transactionnel, unlock auto en fin de transaction.
         * Même pattern que billing-cron — garantit un seul tick actif par cluster.
         */
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "notifications_tick_skipped" }, "Notifications tick skipped — autre réplica actif");
            return;
          }

          const [reminders, alerts] = await Promise.allSettled([
            opts.deps.generateOverdueReminders(),
            opts.deps.generateAlerts(),
          ]);
          if (reminders.status === "rejected") {
            app.log.error({ event: "notifications_tick_reminders_error", error: reminders.reason instanceof Error ? reminders.reason.message : String(reminders.reason) }, "Rappels factures tick échoué");
          }
          if (alerts.status === "rejected") {
            app.log.error({ event: "notifications_tick_alerts_error", error: alerts.reason instanceof Error ? alerts.reason.message : String(alerts.reason) }, "Alertes stock tick échoué");
          }
          app.log.info(
            {
              event: "notifications_tick_done",
              rappelsCreated: reminders.status === "fulfilled" ? reminders.value.rappelsCreated : 0,
              alertsCreated: alerts.status === "fulfilled" ? alerts.value.alertsCreated : 0,
            },
            "Notifications tick terminé",
          );
        });
      },
      (err) => {
        app.log.error({ event: "notifications_tick_error", error: err instanceof Error ? err.message : String(err) }, "Notifications tick échoué");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ hours: intervalHours, runImmediately: false }, task),
    );
  },
  { name: "notifications-cron" },
);

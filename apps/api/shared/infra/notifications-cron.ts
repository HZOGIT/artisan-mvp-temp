import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

export interface NotificationsCronDeps {
  /** Génère rappels factures en retard pour TOUS les artisans (idempotent). */
  readonly generateOverdueReminders: () => Promise<{ rappelsCreated: number }>;
  /** Génère alertes stock bas pour TOUS les artisans. */
  readonly generateAlerts: () => Promise<{ alertsCreated: number }>;
}

export interface NotificationsCronOptions {
  readonly deps: NotificationsCronDeps;
  readonly intervalHours?: number;
}

export const notificationsCronPlugin = fp(
  (app: FastifyInstance, opts: NotificationsCronOptions) => {
    const intervalHours = opts.intervalHours ?? 1;

    const task = new AsyncTask(
      "notifications-tick",
      async () => {
        const [reminders, alerts] = await Promise.allSettled([
          opts.deps.generateOverdueReminders(),
          opts.deps.generateAlerts(),
        ]);
        const remindersVal = reminders.status === "fulfilled" ? reminders.value : null;
        const alertsVal = alerts.status === "fulfilled" ? alerts.value : null;
        if (reminders.status === "rejected") {
          app.log.error({ event: "notifications_tick_reminders_error", error: reminders.reason instanceof Error ? reminders.reason.message : String(reminders.reason) }, "Rappels factures tick échoué");
        }
        if (alerts.status === "rejected") {
          app.log.error({ event: "notifications_tick_alerts_error", error: alerts.reason instanceof Error ? alerts.reason.message : String(alerts.reason) }, "Alertes stock tick échoué");
        }
        app.log.info(
          { event: "notifications_tick_done", rappelsCreated: remindersVal?.rappelsCreated ?? 0, alertsCreated: alertsVal?.alertsCreated ?? 0 },
          "Notifications tick terminé",
        );
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

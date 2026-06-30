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
  /** Génère alertes retard de livraison commandes fournisseurs pour TOUS les artisans. */
  readonly generateCommandeRetardAlerts: () => Promise<{ alertsCreated: number }>;
  /** Génère alertes reconduction tacite contrats maintenance (loi Chatel) pour TOUS les artisans. */
  readonly generateAlertesReconduction: () => Promise<{ alertsCreated: number }>;
  /** Crée les notifications in-app manquantes pour les events de domaine notifiables. */
  readonly generateFromEvents: () => Promise<{ created: number }>;
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

          const [reminders, alerts, commandeRetardAlerts, reconductionAlerts, fromEvents] = await Promise.allSettled([
            opts.deps.generateOverdueReminders(),
            opts.deps.generateAlerts(),
            opts.deps.generateCommandeRetardAlerts(),
            opts.deps.generateAlertesReconduction(),
            opts.deps.generateFromEvents(),
          ]);
          if (reminders.status === "rejected") {
            app.log.error({ event: "notifications_tick_reminders_error", error: reminders.reason instanceof Error ? reminders.reason.message : String(reminders.reason) }, "Rappels factures tick échoué");
          }
          if (alerts.status === "rejected") {
            app.log.error({ event: "notifications_tick_alerts_error", error: alerts.reason instanceof Error ? alerts.reason.message : String(alerts.reason) }, "Alertes stock tick échoué");
          }
          if (commandeRetardAlerts.status === "rejected") {
            app.log.error({ event: "notifications_tick_commande_retard_error", error: commandeRetardAlerts.reason instanceof Error ? commandeRetardAlerts.reason.message : String(commandeRetardAlerts.reason) }, "Alertes retard commandes tick échoué");
          }
          if (reconductionAlerts.status === "rejected") {
            app.log.error({ event: "notifications_tick_reconduction_error", error: reconductionAlerts.reason instanceof Error ? reconductionAlerts.reason.message : String(reconductionAlerts.reason) }, "Alertes reconduction Chatel tick échoué");
          }
          if (fromEvents.status === "rejected") {
            app.log.error({ event: "notifications_tick_from_events_error", error: fromEvents.reason instanceof Error ? fromEvents.reason.message : String(fromEvents.reason) }, "Notifications depuis events tick échoué");
          }
          app.log.info(
            {
              event: "notifications_tick_done",
              rappelsCreated: reminders.status === "fulfilled" ? reminders.value.rappelsCreated : 0,
              alertsCreated: alerts.status === "fulfilled" ? alerts.value.alertsCreated : 0,
              commandeRetardAlertsCreated: commandeRetardAlerts.status === "fulfilled" ? commandeRetardAlerts.value.alertsCreated : 0,
              reconductionAlertsCreated: reconductionAlerts.status === "fulfilled" ? reconductionAlerts.value.alertsCreated : 0,
              fromEventsCreated: fromEvents.status === "fulfilled" ? fromEvents.value.created : 0,
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

import { and, eq, notExists, lt, gte } from "drizzle-orm";
import { eventOutbox, eventLog, notifications } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { JobDefinition } from "../../../platform/scheduler";
import { runReconciler, hourlyKey } from "../../../platform/scheduler";
import type { Anomalie, HealResult } from "../../../platform/scheduler";

const STABLE_DELAY_MS = 5 * 60 * 1000;

/**
 * Borne basse pour la détection d'events manquants : seules les notifications
 * créées APRÈS ce timestamp sont inspectées. Les notifications antérieures
 * appartiennent au backlog historique (marquées lues avant que markAsRead soit
 * atomisé avec withOutbox) — aucun rétroactif, exclure évite une croissance
 * infinie du compteur healing.events.notification-manquant.
 */
const NOTIF_LUE_HEAL_CUTOFF = new Date("2026-06-30T14:25:52.000Z");

interface OutboxBloqueDetails {
  outboxId: number;
  outboxAction: string;
  outboxPayload: unknown;
  outboxUserId: number | null;
  outboxCreatedAt: Date;
}

/**
 * C3 — Outbox bloquée : entre event_outbox entries plus vieilles que `seuilAgeMinutes`
 * (non drainées par le drainer normal) et les draine atomiquement vers event_log.
 * Healing event : "healing.events.outbox-bloque" dans la même tx.
 */
export function createOutboxBloqueJob(opts: {
  db: DbClient;
  seuilAgeMinutes?: number;
  seuil?: number;
  dryRun?: boolean;
  onSeuilDepasse?: (anomalies: ReadonlyArray<Anomalie>) => Promise<void>;
}): JobDefinition {
  const { db, seuilAgeMinutes = 30, seuil = 50, dryRun = true, onSeuilDepasse } = opts;

  return {
    name: "heal:events-outbox-bloque",
    periodKey: hourlyKey,
    run: async () => {
      await runReconciler<OutboxBloqueDetails>(
        db,
        async () => {
          const cutoff = new Date(Date.now() - seuilAgeMinutes * 60 * 1000);
          const rows = await db
            .select()
            .from(eventOutbox)
            .where(lt(eventOutbox.createdAt, cutoff))
            .limit(100);
          return rows.map((r) => ({
            entityType: r.entityType,
            entityId: r.entityId,
            artisanId: r.artisanId,
            invariant: "outbox-bloque",
            details: {
              outboxId: r.id,
              outboxAction: r.action,
              outboxPayload: r.payload,
              outboxUserId: r.userId,
              outboxCreatedAt: r.createdAt,
            },
          }));
        },
        async (anomalie: Anomalie<OutboxBloqueDetails>, tx: DbClient): Promise<HealResult> => {
          const d = anomalie.details;
          const deleted = await tx
            .delete(eventOutbox)
            .where(eq(eventOutbox.id, d.outboxId))
            .returning({ id: eventOutbox.id });
          if (!deleted.length) {
            return {
              avant: { outboxId: d.outboxId, action: d.outboxAction },
              apres: { drained: "already-by-drainer" },
              raison: "outbox-bloquee-deja-drainee",
            };
          }
          await tx.insert(eventLog).values({
            artisanId: anomalie.artisanId,
            userId: d.outboxUserId,
            entityType: anomalie.entityType,
            entityId: anomalie.entityId,
            action: d.outboxAction,
            payload: d.outboxPayload as Record<string, unknown> | null,
            occurredAt: d.outboxCreatedAt,
          });
          return {
            avant: { outboxId: d.outboxId, action: d.outboxAction, createdAt: d.outboxCreatedAt },
            apres: { drained: true },
            raison: "outbox-bloquee-drainee-par-reconciler",
          };
        },
        async (anomalie: Anomalie<OutboxBloqueDetails>, tx: DbClient): Promise<boolean> => {
          const rows = await tx
            .select({ id: eventOutbox.id })
            .from(eventOutbox)
            .where(eq(eventOutbox.id, anomalie.details.outboxId))
            .limit(1);
          return rows.length === 0;
        },
        { action: "healing.events.outbox-bloque", dryRun, seuil, onSeuilDepasse },
      );
    },
  };
}

/**
 * C4 — Event manquant (notification.lue) : notifications marquées lues sans event
 * dans event_log ni event_outbox. Émet l'event manquant via withOutbox (atomique).
 * Healing event : "healing.events.notification-manquant" dans la même tx.
 *
 * ownerDb : connexion artisan_user (bypass RLS) pour detect cross-tenant.
 * db      : connexion app_tenant pour la transaction de heal.
 */
export function createEventManquantNotificationJob(opts: {
  db: DbClient;
  ownerDb: DbClient;
  seuil?: number;
  dryRun?: boolean;
  onSeuilDepasse?: (anomalies: ReadonlyArray<Anomalie>) => Promise<void>;
}): JobDefinition {
  const { db, ownerDb, seuil = 50, dryRun = true, onSeuilDepasse } = opts;

  return {
    name: "heal:events-notification-manquant",
    periodKey: hourlyKey,
    run: async () => {
      await runReconciler(
        db,
        async () => {
          const stableCutoff = new Date(Date.now() - STABLE_DELAY_MS);
          const rows = await ownerDb
            .select({ id: notifications.id, artisanId: notifications.artisanId })
            .from(notifications)
            .where(
              and(
                eq(notifications.lu, true),
                gte(notifications.createdAt, NOTIF_LUE_HEAL_CUTOFF),
                lt(notifications.createdAt, stableCutoff),
                notExists(
                  ownerDb
                    .select({ id: eventLog.id })
                    .from(eventLog)
                    .where(
                      and(
                        eq(eventLog.entityType, "notification"),
                        eq(eventLog.entityId, notifications.id),
                        eq(eventLog.action, "notification.lue"),
                      ),
                    ),
                ),
                notExists(
                  ownerDb
                    .select({ id: eventOutbox.id })
                    .from(eventOutbox)
                    .where(
                      and(
                        eq(eventOutbox.entityType, "notification"),
                        eq(eventOutbox.entityId, notifications.id),
                        eq(eventOutbox.action, "notification.lue"),
                      ),
                    ),
                ),
              ),
            )
            .limit(100);

          return rows.map((r) => ({
            entityType: "notification",
            entityId: r.id,
            artisanId: r.artisanId,
            invariant: "event-manquant",
            details: { notificationId: r.id },
          }));
        },
        async (anomalie, tx) => {
          await tx.insert(eventOutbox).values({
            artisanId: anomalie.artisanId,
            userId: null,
            entityType: "notification",
            entityId: anomalie.entityId,
            action: "notification.lue",
            payload: { notificationId: anomalie.entityId, reconciledBy: "heal:events-notification-manquant" },
          });
          return {
            avant: { hasEvent: false },
            apres: { hasEvent: true },
            raison: "event-notification.lue-manquant-emis-par-reconciler",
          };
        },
        async (anomalie, tx) => {
          const rows = await tx
            .select({ id: eventOutbox.id })
            .from(eventOutbox)
            .where(
              and(
                eq(eventOutbox.entityType, "notification"),
                eq(eventOutbox.entityId, anomalie.entityId),
                eq(eventOutbox.action, "notification.lue"),
              ),
            )
            .limit(1);
          return rows.length > 0;
        },
        { action: "healing.events.notification-manquant", dryRun, seuil, onSeuilDepasse },
      );
    },
  };
}

import { and, inArray, notExists, isNotNull, sql } from "drizzle-orm";
import { eventLog, notifications } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";

/**
 * Events de domaine qui déclenchent une notification in-app.
 * Exclus volontairement : events internes/bruyants (devis.cree, devis.supprime,
 * devis.ligne_ajoutee, client.cree), et abonnement.suspendu déjà couvert par
 * SubscriptionEventNotifierDrizzle (évite les doublons).
 */
const ACTIONS_NOTIFIABLES = [
  "devis.envoye",
  "devis.accepte",
  "devis.refuse",
  "abonnement.plan_change",
  "abonnement.annule",
  "facture.envoyee",
  "facture.payee",
] as const;

type ActionNotifiable = (typeof ACTIONS_NOTIFIABLES)[number];

type NotifInput = {
  artisanId: number;
  type: "info" | "alerte" | "succes";
  titre: string;
  message: string;
  lien: string;
};

function buildNotif(
  artisanId: number,
  eventId: number,
  action: ActionNotifiable,
  entityId: number,
  payload: Record<string, unknown> | null,
): NotifInput {
  switch (action) {
    case "devis.envoye":
      return {
        artisanId,
        type: "info",
        titre: "Devis envoyé au client",
        message: payload?.numero ? `Le devis ${String(payload.numero)} a été envoyé.` : "Un devis a été envoyé au client.",
        lien: `/devis/${entityId}?ev=${eventId}`,
      };
    case "devis.accepte":
      return {
        artisanId,
        type: "succes",
        titre: "Devis accepté",
        message: payload?.numero ? `Le devis ${String(payload.numero)} a été accepté par le client.` : "Votre devis a été accepté.",
        lien: `/devis/${entityId}?ev=${eventId}`,
      };
    case "devis.refuse":
      return {
        artisanId,
        type: "alerte",
        titre: "Devis refusé",
        message: payload?.numero ? `Le devis ${String(payload.numero)} a été refusé par le client.` : "Votre devis a été refusé.",
        lien: `/devis/${entityId}?ev=${eventId}`,
      };
    case "abonnement.plan_change":
      return {
        artisanId,
        type: "info",
        titre: "Changement de plan",
        message:
          payload?.from && payload?.to
            ? `Passage du plan ${String(payload.from)} au plan ${String(payload.to)}.`
            : "Votre plan d'abonnement a changé.",
        lien: `/parametres?tab=abonnement&ev=${eventId}`,
      };
    case "abonnement.annule":
      return {
        artisanId,
        type: "alerte",
        titre: "Abonnement annulé",
        message: "Votre abonnement a été annulé.",
        lien: `/parametres?tab=abonnement&ev=${eventId}`,
      };
    case "facture.envoyee":
      return {
        artisanId,
        type: "info",
        titre: "Facture envoyée",
        message: "Une facture a été envoyée au client.",
        lien: `/factures/${entityId}?ev=${eventId}`,
      };
    case "facture.payee":
      return {
        artisanId,
        type: "succes",
        titre: "Paiement reçu",
        message: "Le paiement d'une facture a été reçu.",
        lien: `/factures/${entityId}?ev=${eventId}`,
      };
  }
}

/**
 * Crée des notifications in-app pour les events de domaine notifiables (ACTIONS_NOTIFIABLES)
 * non encore couverts par une notification existante.
 *
 * Cross-tenant : ownerDb (bypass RLS) — lecture event_log + insertion notifications.
 * Idempotent : lien unique par event (`?ev=${eventId}`) — NOT EXISTS dans la requête SQL.
 * Max 100 events par appel (traitement léger, appel toutes les heures via notifications-cron).
 */
export async function creerNotificationsDepuisEvents(ownerDb: DbClient): Promise<{ created: number }> {
  const eventsATraiter = await ownerDb
    .select({
      id: eventLog.id,
      artisanId: eventLog.artisanId,
      action: eventLog.action,
      entityId: eventLog.entityId,
      payload: eventLog.payload,
    })
    .from(eventLog)
    .where(
      and(
        inArray(eventLog.action, [...ACTIONS_NOTIFIABLES]),
        isNotNull(eventLog.artisanId),
        notExists(
          ownerDb
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                sql`${notifications.artisanId} = ${eventLog.artisanId}`,
                sql`${notifications.lien} LIKE CONCAT('%ev=', ${eventLog.id}::text)`,
              ),
            ),
        ),
      ),
    )
    .limit(100);

  let created = 0;
  for (const row of eventsATraiter) {
    if (row.artisanId == null) continue;
    if (!(ACTIONS_NOTIFIABLES as readonly string[]).includes(row.action)) continue;
    const notif = buildNotif(
      row.artisanId,
      row.id,
      row.action as ActionNotifiable,
      row.entityId,
      row.payload as Record<string, unknown> | null,
    );
    await ownerDb.insert(notifications).values(notif);
    created++;
  }
  return { created };
}

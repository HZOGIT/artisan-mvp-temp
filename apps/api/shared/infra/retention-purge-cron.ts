import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { sql } from "drizzle-orm";
import type { DbClient } from "../db";

const LOCK_ID = BigInt("0xe4e40002");

/**
 * TTL RGPD par table — Art. 5(1)(e).
 * Modifier ici uniquement ; aucun magic number dans les requêtes.
 */
const TTL = {
  /** CNIL : 3 ans à compter du dernier contact pour les prospects non convertis. */
  PROSPECT_YEARS: 3,
  /** Marge après expiration de session (IP/user-agent plus utiles après expiration). */
  SESSION_GRACE_DAYS: 7,
  /** Journal d'événements — CNIL recommande 1 an max pour les logs applicatifs. */
  EVENT_LOG_DAYS: 365,
  /** event_outbox non drainé après 30j = stale, ne sera jamais traité. */
  EVENT_OUTBOX_STALE_DAYS: 30,
  /** HTML d'email outbox : anonymisé après 30j (colonne NOT NULL → chaîne vide). */
  EMAIL_HTML_DAYS: 30,
  /** emails_log — CNIL recommande 1 an max pour les logs d'envoi. */
  EMAIL_LOG_DAYS: 365,
  /** Appareils inactifs : base légale sécurité = 90j max d'inactivité. */
  DEVICE_INACTIVITY_DAYS: 90,
  /** Payloads LLM (input/output peuvent contenir PII tierces) : anonymisés après 30j. */
  LLM_PAYLOAD_DAYS: 30,
} as const;

export interface RetentionPurgeCronOptions {
  readonly db: DbClient;
}

/** Purge multi-tables RGPD — exporté pour les tests L2 (pas d'advisory lock). */
export async function runRetentionPurge(db: DbClient): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM demandes_contact
      WHERE statut IN ('perdu', 'nouveau')
        AND "updatedAt" < now() - ${TTL.PROSPECT_YEARS} * interval '1 year'
    `);

    await tx.execute(sql`
      DELETE FROM active_sessions
      WHERE expires_at < now() - ${TTL.SESSION_GRACE_DAYS} * interval '1 day'
    `);

    await tx.execute(sql`
      DELETE FROM client_portal_sessions
      WHERE "expiresAt" < now() - ${TTL.SESSION_GRACE_DAYS} * interval '1 day'
    `);

    await tx.execute(sql`
      UPDATE users
      SET "resetToken" = NULL, "resetTokenExpiry" = NULL
      WHERE "resetTokenExpiry" IS NOT NULL AND "resetTokenExpiry" < now()
    `);

    await tx.execute(sql`
      DELETE FROM events
      WHERE "createdAt" < now() - ${TTL.EVENT_LOG_DAYS} * interval '1 day'
    `);

    await tx.execute(sql`
      DELETE FROM event_outbox
      WHERE "createdAt" < now() - ${TTL.EVENT_OUTBOX_STALE_DAYS} * interval '1 day'
    `);

    await tx.execute(sql`
      UPDATE email_outbox
      SET html = ''
      WHERE statut = 'sent' AND html <> ''
        AND traitee_at < now() - ${TTL.EMAIL_HTML_DAYS} * interval '1 day'
    `);

    await tx.execute(sql`
      DELETE FROM emails_log
      WHERE "createdAt" < now() - ${TTL.EMAIL_LOG_DAYS} * interval '1 day'
    `);

    await tx.execute(sql`
      DELETE FROM devices
      WHERE last_active_at < now() - ${TTL.DEVICE_INACTIVITY_DAYS} * interval '1 day'
    `);

    await tx.execute(sql`
      UPDATE llm_usage
      SET input_payload = NULL, output_payload = NULL
      WHERE created_at < now() - ${TTL.LLM_PAYLOAD_DAYS} * interval '1 day'
        AND (input_payload IS NOT NULL OR output_payload IS NOT NULL)
    `);
  });
}

/**
 * Cron RGPD Art. 5(1)(e) — rétention limitée multi-tables.
 * Tourne toutes les 24 h avec advisory lock transactionnel pour éviter les doublons en multi-réplica.
 */
export const retentionPurgeCronPlugin = fp(
  (app: FastifyInstance, opts: RetentionPurgeCronOptions) => {
    const task = new AsyncTask(
      "retention-purge",
      async () => {
        let skip = false;
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(
            `SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`,
          );
          skip = (lockResult.rows[0] as { acquired: boolean }).acquired !== true;
        });
        if (skip) {
          app.log.debug({ event: "retention_purge_skipped" }, "Rétention RGPD skippée — autre réplica actif");
          return;
        }
        await runRetentionPurge(opts.db);
        app.log.info({ event: "retention_purge_done" }, "Rétention RGPD — purge multi-tables terminée (Art. 5(1)(e))");
      },
      (err) => {
        app.log.error(
          { event: "retention_purge_error", error: err instanceof Error ? err.message : String(err) },
          "Erreur rétention RGPD",
        );
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ hours: 24, runImmediately: false }, task),
    );
  },
  { name: "retention-purge-cron" },
);

import { and, eq, sql } from "drizzle-orm";
import { emailsLog } from "../../../../../drizzle/schema.pg";
import { runReconciler } from "../../../platform/scheduler/reconciler";
import type { Anomalie, HealResult } from "../../../platform/scheduler/reconciler";
import type { DbClient } from "../../../shared/db";
import type { JobDefinition } from "../../../platform/scheduler/scheduler-types";
import { dailyKey } from "../../../platform/scheduler/scheduler-types";

const ACTION = "healing.emails.log-manquant";
const SEUIL = 50;
const STABLE_MIN = 5;
const WINDOW_DAYS = 7;

type EmailGapDetails = { readonly action: string };

export interface EmailsLogReconcilerOpts {
  readonly dryRun?: boolean;
  readonly seuil?: number;
  readonly onSeuilDepasse?: (anomalies: ReadonlyArray<Anomalie>) => Promise<void>;
}

export function createEmailsLogReconcilerJob(
  db: DbClient,
  opts: EmailsLogReconcilerOpts = {},
): JobDefinition {
  return {
    name: "heal:emails-log",
    periodKey: dailyKey,
    run: async () => runEmailsLogReconciler(db, opts),
  };
}

/** Exported pour les tests. */
export async function runEmailsLogReconciler(
  db: DbClient,
  opts: EmailsLogReconcilerOpts = {},
): Promise<void> {
  const stableBefore = new Date(Date.now() - STABLE_MIN * 60_000);
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  await runReconciler<EmailGapDetails>(
    db,
    async () => {
      const result = await db.execute<{
        artisanId: number;
        entityType: string;
        entityId: number;
        action: string;
      }>(sql`
        SELECT DISTINCT ON ("artisanId", "entityType", "entityId")
          "artisanId",
          "entityType",
          "entityId",
          action
        FROM events
        WHERE action IN ('facture.email_envoye', 'devis.email_envoye')
          AND "artisanId" IS NOT NULL
          AND "createdAt" < ${stableBefore}
          AND "createdAt" > ${windowStart}
          AND NOT EXISTS (
            SELECT 1 FROM emails_log el
            WHERE el."artisanId" = events."artisanId"
              AND el."entiteType" = events."entityType"
              AND el."entiteId" = events."entityId"
          )
        LIMIT 100
      `);

      return result.rows.map(
        (r): Anomalie<EmailGapDetails> => ({
          artisanId: Number(r.artisanId),
          entityType: r.entityType,
          entityId: Number(r.entityId),
          invariant: "log-manquant",
          details: { action: r.action },
        }),
      );
    },
    async (anomalie, tx): Promise<HealResult> => {
      const type = anomalie.entityType === "facture" ? "envoi_facture" : "envoi_devis";
      await tx.insert(emailsLog).values({
        artisanId: anomalie.artisanId,
        destinataire: "inconnu",
        sujet: "inconnu",
        type,
        statut: "inconnu",
        entiteType: anomalie.entityType,
        entiteId: anomalie.entityId,
      });
      return {
        avant: null,
        apres: { type, statut: "inconnu", entiteType: anomalie.entityType, entiteId: anomalie.entityId },
        raison: "emails_log manquant — backfill reconciler",
      };
    },
    async (anomalie, tx) => {
      const rows = await tx
        .select({ id: emailsLog.id })
        .from(emailsLog)
        .where(
          and(
            eq(emailsLog.artisanId, anomalie.artisanId),
            eq(emailsLog.entiteType, anomalie.entityType),
            eq(emailsLog.entiteId, anomalie.entityId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    {
      action: ACTION,
      dryRun: opts.dryRun ?? true,
      seuil: opts.seuil ?? SEUIL,
      onSeuilDepasse: opts.onSeuilDepasse,
    },
  );
}

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { inArray, lt, sql, count } from "drizzle-orm";
import {
  artisans, llmUsage,
  facturesCycleVieEvents, facturesEntrantes,
  files, messageFiles,
  paEntites, paOutbox,
  piecesJointes,
} from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";

export interface RgpdCronOptions {
  readonly db: DbClient;
}

const LOCK_ID = BigInt("0xd417d417");
const RETENTION_DAYS = 30;

export interface RgpdDryRunResult {
  artisanIds: number[];
  pendingDates: (Date | null)[];
  counts: Record<string, number>;
}

/**
 * DRY-RUN RGPD Art. 17 — compte les lignes qui seraient purgées, sans rien supprimer.
 * Requiert le pool owner (bypass FORCE ROW LEVEL SECURITY — cross-tenant).
 * Exporté pour les tests L2.
 *
 * ponytail: mode DRY-RUN volontaire — AHV requis avant d'armer la suppression réelle.
 */
export async function runRgpdPurgeDryRun(db: DbClient): Promise<RgpdDryRunResult> {
  const threshold = sql`now() - interval '${sql.raw(String(RETENTION_DAYS))} days'`;
  const pending = await db
    .select({ id: artisans.id, pendingDeletionAt: artisans.pendingDeletionAt })
    .from(artisans)
    .where(lt(artisans.pendingDeletionAt, threshold));

  if (pending.length === 0) return { artisanIds: [], pendingDates: [], counts: {} };

  const ids = pending.map((r) => r.id);
  const pendingDates = pending.map((r) => r.pendingDeletionAt);

  const [c1, c2, c3, c4, c5, c6, c7, c8] = await Promise.all([
    db.select({ c: count() }).from(llmUsage).where(inArray(llmUsage.artisanId, ids)),
    db.select({ c: count() }).from(facturesCycleVieEvents).where(inArray(facturesCycleVieEvents.artisanId, ids)),
    db.select({ c: count() }).from(facturesEntrantes).where(inArray(facturesEntrantes.artisanId, ids)),
    db.select({ c: count() }).from(files).where(inArray(files.artisanId as Parameters<typeof inArray>[0], ids)),
    db.select({ c: count() }).from(messageFiles).where(inArray(messageFiles.artisanId, ids)),
    db.select({ c: count() }).from(paEntites).where(inArray(paEntites.artisanId, ids)),
    db.select({ c: count() }).from(paOutbox).where(inArray(paOutbox.artisanId, ids)),
    db.select({ c: count() }).from(piecesJointes).where(inArray(piecesJointes.artisanId, ids)),
  ]);

  return {
    artisanIds: ids,
    pendingDates,
    counts: {
      llm_usage:                  Number(c1[0]?.c ?? 0),
      factures_cycle_vie_events:  Number(c2[0]?.c ?? 0),
      factures_entrantes:         Number(c3[0]?.c ?? 0),
      files:                      Number(c4[0]?.c ?? 0),
      message_files:              Number(c5[0]?.c ?? 0),
      pa_entites:                 Number(c6[0]?.c ?? 0),
      pa_outbox:                  Number(c7[0]?.c ?? 0),
      pieces_jointes:             Number(c8[0]?.c ?? 0),
      artisans:                   ids.length,
    },
  };
}

/**
 * Cron RGPD Art. 17 — audit en DRY-RUN des comptes artisan en attente de suppression depuis > 30j.
 * Utilise le pool owner pour bypass FORCE RLS (cross-tenant).
 * NE SUPPRIME RIEN — présenter volumes + politique à l'humain avant d'armer la purge réelle (AHV).
 */
export const rgpdCronPlugin = fp(
  (app: FastifyInstance, opts: RgpdCronOptions) => {
    const task = new AsyncTask(
      "rgpd-purge",
      async () => {
        let skip = false;
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          skip = (lockResult.rows[0] as { acquired: boolean }).acquired !== true;
        });
        if (skip) {
          app.log.debug({ event: "rgpd_purge_skipped" }, "RGPD Art.17 dry-run skipped — autre réplica actif");
          return;
        }

        const result = await runRgpdPurgeDryRun(opts.db);

        if (result.artisanIds.length === 0) {
          app.log.info({ event: "rgpd_purge_dryrun_nothing" }, `RGPD Art.17 dry-run — aucun compte au-delà de ${RETENTION_DAYS}j`);
          return;
        }

        app.log.warn(
          {
            event: "rgpd_purge_dryrun",
            artisanIds:   result.artisanIds,
            pendingDates: result.pendingDates,
            counts:       result.counts,
          },
          `RGPD Art.17 DRY-RUN — ${result.artisanIds.length} compte(s) seraient purgés (AHV requis avant armement)`,
        );
      },
      (err) => {
        app.log.error(
          { event: "rgpd_purge_error", error: err instanceof Error ? err.message : String(err) },
          "Erreur audit RGPD Art.17 dry-run",
        );
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ hours: 24, runImmediately: false }, task),
    );
  },
  { name: "rgpd-cron" },
);

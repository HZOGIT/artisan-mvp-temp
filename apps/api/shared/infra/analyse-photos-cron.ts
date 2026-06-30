import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { eq } from "drizzle-orm";
import { analysesPhotosChantier, photosAnalyse } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";
import type { AnalyserPhotosDeps } from "../../modules/devis-ia/application/use-cases";
import { analyserPhotos } from "../../modules/devis-ia/application/use-cases";

const LOCK_ID = BigInt("0xa170a170");

export interface AnalysePhotosCronOptions {
  readonly ownerDb: DbClient;
  readonly devisIADeps: AnalyserPhotosDeps;
  readonly intervalMinutes?: number;
}

/**
 * Retourne les analyses `en_attente` ayant au moins 1 photo, sans filtre RLS (ownerDb requis).
 * Exporté pour les tests L2.
 */
export async function findAnalysesEnAttenteAvecPhotos(ownerDb: DbClient): Promise<Array<{ id: number; artisanId: number }>> {
  return ownerDb
    .selectDistinct({ id: analysesPhotosChantier.id, artisanId: analysesPhotosChantier.artisanId })
    .from(analysesPhotosChantier)
    .innerJoin(photosAnalyse, eq(photosAnalyse.analyseId, analysesPhotosChantier.id))
    .where(eq(analysesPhotosChantier.statut, "en_attente"));
}

/**
 * Traite toutes les analyses `en_attente` ayant des photos.
 * Chaque appel IA est best-effort : un échec pose le statut `erreur` (via `analyserPhotos`) et continue.
 * Exporté pour les tests L2.
 */
export async function processAnalysesEnAttente(
  ownerDb: DbClient,
  devisIADeps: AnalyserPhotosDeps,
): Promise<{ processed: number; errors: number }> {
  const analyses = await findAnalysesEnAttenteAvecPhotos(ownerDb);
  let processed = 0;
  let errors = 0;
  for (const { id, artisanId } of analyses) {
    try {
      await analyserPhotos(devisIADeps, { artisanId, userId: 0 }, id);
      processed++;
    } catch {
      /* ponytail: best-effort — erreur par photo comptée dans errors, cron continue */
      errors++;
    }
  }
  return { processed, errors };
}

export const analysePhotosCronPlugin = fp(
  (app: FastifyInstance, opts: AnalysePhotosCronOptions) => {
    const intervalMinutes = opts.intervalMinutes ?? 5;

    const task = new AsyncTask(
      "analyse-photos-cron-tick",
      async () => {
        let toProcess: Array<{ id: number; artisanId: number }> = [];

        await opts.ownerDb.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "analyse_photos_cron_skipped" }, "Analyse-photos cron skippé — autre réplica actif");
            return;
          }
          toProcess = await tx
            .selectDistinct({ id: analysesPhotosChantier.id, artisanId: analysesPhotosChantier.artisanId })
            .from(analysesPhotosChantier)
            .innerJoin(photosAnalyse, eq(photosAnalyse.analyseId, analysesPhotosChantier.id))
            .where(eq(analysesPhotosChantier.statut, "en_attente"));
        });

        if (toProcess.length === 0) return;

        app.log.info({ event: "analyse_photos_cron_start", count: toProcess.length }, "Analyse-photos cron — traitement des analyses bloquées");

        let done = 0;
        for (const { id, artisanId } of toProcess) {
          try {
            await analyserPhotos(opts.devisIADeps, { artisanId, userId: 0 }, id);
            done++;
          } catch (e) {
            app.log.warn(
              { event: "analyse_photos_cron_error", analyseId: id, error: e instanceof Error ? e.message : String(e) },
              "Analyse-photos cron — erreur sur analyse (statut erreur posé)",
            );
          }
        }

        app.log.info({ event: "analyse_photos_cron_done", processed: done, total: toProcess.length }, "Analyse-photos cron terminé");
      },
      (err) => {
        app.log.error(
          { event: "analyse_photos_cron_fatal", error: err instanceof Error ? err.message : String(err) },
          "Analyse-photos cron — erreur fatale",
        );
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ minutes: intervalMinutes, runImmediately: false }, task),
    );
  },
  { name: "analyse-photos-cron" },
);

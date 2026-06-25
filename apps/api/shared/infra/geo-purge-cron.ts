import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { ITechnicienRepository } from "../../modules/techniciens/application/technicien-repository";
import type { DbClient } from "../db";

const GEO_PURGE_LOCK_ID = BigInt("0xcea0cea0");

export interface GeoPurgeCronOptions {
  readonly technicienRepo: ITechnicienRepository;
  readonly db: DbClient;
  readonly intervalHours?: number;
}

/**
 * Cron CNIL — purge des positions GPS expirées (`expiresAt < now()`).
 * Conforme délib. 2015-165 : conservation limitée à 8 h par enregistrement.
 * `pg_try_advisory_xact_lock` évite les doublons en multi-réplica (pattern billing-cron).
 */
export const geoPurgeCronPlugin = fp(
  (app: FastifyInstance, opts: GeoPurgeCronOptions) => {
    const intervalHours = opts.intervalHours ?? 6;

    const task = new AsyncTask(
      "geo-purge",
      async () => {
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${GEO_PURGE_LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "geo_purge_skipped" }, "Purge GPS skippée — autre réplica actif");
            return;
          }
          const count = await opts.technicienRepo.purgerPositionsExpirees();
          if (count > 0) {
            app.log.info({ event: "geo_purge_done", deleted: count }, `Purge GPS : ${count} position(s) expirée(s) supprimée(s)`);
          }
        });
      },
      (err) => {
        app.log.error({ event: "geo_purge_error", error: err instanceof Error ? err.message : String(err) }, "Purge GPS échouée");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ hours: intervalHours, runImmediately: true }, task),
    );
  },
  { name: "geo-purge-cron" },
);

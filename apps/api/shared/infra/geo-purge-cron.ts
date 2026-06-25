import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { ITechnicienRepository } from "../../modules/techniciens/application/technicien-repository";

export interface GeoPurgeCronOptions {
  readonly technicienRepo: ITechnicienRepository;
  readonly intervalHours?: number;
}

/**
 * Cron CNIL — purge quotidienne des positions GPS expirées (`expiresAt < now()`).
 * Conforme délib. 2015-165 : conservation limitée à 8 h par enregistrement.
 */
export const geoPurgeCronPlugin = fp(
  (app: FastifyInstance, opts: GeoPurgeCronOptions) => {
    const intervalHours = opts.intervalHours ?? 6;

    const task = new AsyncTask(
      "geo-purge",
      async () => {
        const count = await opts.technicienRepo.purgerPositionsExpirees();
        if (count > 0) {
          app.log.info({ event: "geo_purge_done", deleted: count }, `Purge GPS : ${count} position(s) expirée(s) supprimée(s)`);
        }
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

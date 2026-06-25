import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { lt, sql } from "drizzle-orm";
import { artisans } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";

export interface RgpdCronOptions {
  readonly db: DbClient;
}

/** Purge définitive des comptes artisan dont la suppression est en attente depuis plus de 30 jours. */
export const rgpdCronPlugin = fp(
  (app: FastifyInstance, opts: RgpdCronOptions) => {
    const task = new AsyncTask(
      "rgpd-purge",
      async () => {
        const thirtyDaysAgo = sql`now() - interval '30 days'`;
        const result = await opts.db
          .delete(artisans)
          .where(lt(artisans.pendingDeletionAt, thirtyDaysAgo))
          .returning({ id: artisans.id });
        if (result.length > 0) {
          app.log.info({ event: "rgpd_purge_done", count: result.length }, "Comptes artisan purgés définitivement (RGPD Art. 17)");
        }
      },
      (err) => {
        app.log.error({ event: "rgpd_purge_error", error: err instanceof Error ? err.message : String(err) }, "Erreur purge RGPD");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ hours: 24, runImmediately: false }, task),
    );
  },
  { name: "rgpd-cron" },
);

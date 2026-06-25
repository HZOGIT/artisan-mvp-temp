import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { inArray, lt, sql } from "drizzle-orm";
import { artisans, llmUsage } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db";

export interface RgpdCronOptions {
  readonly db: DbClient;
}

const LOCK_ID = BigInt("0xd417d417");

/** Purge définitive des comptes artisan dont la suppression est en attente depuis plus de 30 jours. */
export const rgpdCronPlugin = fp(
  (app: FastifyInstance, opts: RgpdCronOptions) => {
    const task = new AsyncTask(
      "rgpd-purge",
      async () => {
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "rgpd_purge_skipped" }, "RGPD purge skipped — autre réplica actif");
            return;
          }

          const thirtyDaysAgo = sql`now() - interval '30 days'`;
          const pending = await tx
            .select({ id: artisans.id })
            .from(artisans)
            .where(lt(artisans.pendingDeletionAt, thirtyDaysAgo));

          if (pending.length === 0) return;

          const ids = pending.map((r) => r.id);
          await tx.delete(llmUsage).where(inArray(llmUsage.artisanId, ids));
          await tx.delete(artisans).where(inArray(artisans.id, ids));

          app.log.info({ event: "rgpd_purge_done", count: ids.length }, "Comptes artisan purgés définitivement (RGPD Art. 17)");
        });
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

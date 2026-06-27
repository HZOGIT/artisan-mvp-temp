import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { IContratRepository } from "../../modules/contrats-maintenance/application/contrat-repository";
import { autoGenererInterventionsContrats } from "../../modules/contrats-maintenance/application/auto-intervention-use-cases";
import type { DbClient } from "../db";
import { artisans as artisansTable } from "../../../../drizzle/schema.pg";

const LOCK_ID = BigInt("0xc0d5c0d5");

export interface ContratsVisitesCronOptions {
  readonly repo: IContratRepository;
  readonly db: DbClient;
  readonly intervalMinutes?: number;
}

export const contratsVisitesCronPlugin = fp(
  (app: FastifyInstance, opts: ContratsVisitesCronOptions) => {
    const intervalMinutes = opts.intervalMinutes ?? 60;

    const task = new AsyncTask(
      "contrats-visites-tick",
      async () => {
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "contrats_visites_tick_skipped" }, "Contrats-visites tick skipped — autre réplica actif");
            return;
          }
          const rows = await opts.db.select({ id: artisansTable.id }).from(artisansTable);
          const artisanIds = rows.map((r) => r.id);
          const result = await autoGenererInterventionsContrats(opts.repo, artisanIds, new Date());
          app.log.info({ event: "contrats_visites_tick_done", ...result }, "Contrats-visites tick terminé");
        });
      },
      (err) => {
        app.log.error({ event: "contrats_visites_tick_error", error: err instanceof Error ? err.message : String(err) }, "Contrats-visites tick échoué");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ minutes: intervalMinutes, runImmediately: false }, task),
    );
  },
  { name: "contrats-visites-cron" },
);

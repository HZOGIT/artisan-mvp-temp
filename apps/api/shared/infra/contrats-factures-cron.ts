import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { IContratRepository } from "../../modules/contrats-maintenance/application/contrat-repository";
import type { ContratFactureGenerator } from "../../modules/contrats-maintenance/application/contrat-facture-generator";
import { autoGenererFacturesContrats } from "../../modules/contrats-maintenance/application/auto-facturation-use-cases";
import type { DbClient } from "../db";
import { artisans as artisansTable } from "../../../../drizzle/schema.pg";

const LOCK_ID = BigInt("0xc0d4c0d4");

export interface ContratFacturesCronOptions {
  readonly repo: IContratRepository;
  readonly factureGen: ContratFactureGenerator;
  /** APP_DATABASE_URL — advisory lock + listing artisans (hors RLS). */
  readonly db: DbClient;
  readonly intervalMinutes?: number;
}

export const contratsFacturesCronPlugin = fp(
  (app: FastifyInstance, opts: ContratFacturesCronOptions) => {
    const intervalMinutes = opts.intervalMinutes ?? 60;

    const task = new AsyncTask(
      "contrats-factures-tick",
      async () => {
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "contrats_factures_tick_skipped" }, "Contrats-factures tick skipped — autre réplica actif");
            return;
          }
          const rows = await opts.db.select({ id: artisansTable.id }).from(artisansTable);
          const artisanIds = rows.map((r) => r.id);
          const result = await autoGenererFacturesContrats(opts.repo, opts.factureGen, artisanIds, new Date());
          app.log.info({ event: "contrats_factures_tick_done", ...result }, "Contrats-factures tick terminé");
        });
      },
      (err) => {
        app.log.error({ event: "contrats_factures_tick_error", error: err instanceof Error ? err.message : String(err) }, "Contrats-factures tick échoué");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ minutes: intervalMinutes, runImmediately: false }, task),
    );
  },
  { name: "contrats-factures-cron" },
);

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import "@fastify/schedule";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { DbClient } from "../db";
import type { EmailPort } from "../ports/email";
import { envoyerRappelsRdvClients } from "../../modules/interventions/application/rappel-rdv-client-use-cases";

export interface RappelRdvClientCronOptions {
  readonly db: DbClient;
  readonly email: EmailPort;
  readonly intervalHours?: number;
}

const LOCK_ID = BigInt("0x5d5dd4d4");

export const rappelRdvClientCronPlugin = fp(
  (app: FastifyInstance, opts: RappelRdvClientCronOptions) => {
    const intervalHours = opts.intervalHours ?? 1;

    const task = new AsyncTask(
      "rappel-rdv-client-tick",
      async () => {
        await opts.db.transaction(async (tx) => {
          const lockResult = await tx.execute(`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS acquired`);
          const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired === true;
          if (!acquired) {
            app.log.debug({ event: "rappel_rdv_tick_skipped" }, "Rappel RDV client tick skipped — autre réplica actif");
            return;
          }
        });

        const result = await envoyerRappelsRdvClients(opts.db, opts.email);
        app.log.info({ event: "rappel_rdv_tick_done", ...result }, "Rappel RDV client tick terminé");
      },
      (err) => {
        app.log.error({ event: "rappel_rdv_tick_error", error: err instanceof Error ? err.message : String(err) }, "Rappel RDV client tick échoué");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ hours: intervalHours, runImmediately: false }, task),
    );
  },
  { name: "rappel-rdv-client-cron" },
);

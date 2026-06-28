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

/*
 * ponytail: pas de verrou advisory session-level — déploiement single-replica.
 * L'idempotence est assurée par `rappelClientEnvoye=true` posé après envoi :
 * un second tick (ou un redémarrage) ne renvoie jamais deux fois le même email.
 * Si on passe multi-replica, ajouter pg_try_advisory_lock session-level sur une
 * connexion dédiée tenu pendant toute la durée du tick (calque pa-outbox-drainer).
 */
export const rappelRdvClientCronPlugin = fp(
  (app: FastifyInstance, opts: RappelRdvClientCronOptions) => {
    const intervalHours = opts.intervalHours ?? 1;

    const task = new AsyncTask(
      "rappel-rdv-client-tick",
      async () => {
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

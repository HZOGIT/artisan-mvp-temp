import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import { and, eq, max, sql } from "drizzle-orm";
import type { PaPort } from "../../modules/einvoicing/application/pa-port";
import type { DbClient } from "../db";
import { artisans as artisansTable, paEntites, facturesEntrantes } from "../../../../drizzle/schema.pg";

/* ponytail: lock différent du drainer outbox (0xb111d0cc) — lock session-level évite le double-poll multi-réplica */
const LOCK_ID = BigInt("0xb111d1bb");

export interface PaInboundPollerOptions {
  readonly pa: PaPort;
  readonly db: DbClient;
  readonly dbUrl: string;
}

/** Exécute un tick de poll pour tous les artisans PA provisionnés. Exporté pour test L1/L2. */
export async function pollInbound(pa: PaPort, db: DbClient): Promise<number> {
  /* artisans = table RLS-OFF → lecture cross-tenant sûre (pattern identique à pa-outbox-drainer.ts) */
  const artisanRows = await db.select({ id: artisansTable.id }).from(artisansTable);

  let fetched = 0;
  for (const { id: artisanId } of artisanRows) {
    await db.transaction(async (tx) => {
      /* set_config transaction-local : RLS activée pour toutes les requêtes suivantes dans ce tx */
      await tx.execute(sql`SELECT set_config('app.tenant', ${String(artisanId)}, true)`);

      const [entite] = await tx
        .select({ paEntityId: paEntites.paEntityId })
        .from(paEntites)
        .where(
          and(
            eq(paEntites.artisanId, artisanId),
            eq(paEntites.statutProvisioning, "done"),
          ),
        )
        .limit(1);

      if (!entite?.paEntityId) return;

      const [lastRow] = await tx
        .select({ lastFetch: max(facturesEntrantes.fetchedAt) })
        .from(facturesEntrantes)
        .where(eq(facturesEntrantes.artisanId, artisanId));

      const since = lastRow?.lastFetch ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const inbounds = await pa.listInbound(entite.paEntityId, since, artisanId);

      for (const doc of inbounds) {
        const full = await pa.fetchInbound(doc.paDocumentId, artisanId);
        await tx
          .insert(facturesEntrantes)
          .values({
            artisanId,
            paDocumentId: full.paDocumentId,
            emetteurSiret: full.emetteurSiret,
            montantTTC: full.montantTTC,
            date: full.date,
            facturxBase64: full.facturxBase64,
          })
          .onConflictDoNothing();
        fetched++;
      }
    });
  }
  return fetched;
}

export const paInboundPollerPlugin = fp(
  (app: FastifyInstance, opts: PaInboundPollerOptions) => {
    const task = new AsyncTask(
      "pa-inbound-poll",
      async () => {
        const client = new pg.Client({ connectionString: opts.dbUrl });
        await client.connect();
        try {
          const { rows } = await client.query(
            `SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`,
          );
          if (!(rows[0] as { acquired: boolean }).acquired) {
            app.log.debug({ event: "pa_inbound_lock_skipped" }, "PA inbound poll: lock non acquis, autre instance active");
            return;
          }
          try {
            const fetched = await pollInbound(opts.pa, opts.db);
            if (fetched > 0) {
              app.log.info({ event: "pa_inbound_poll_done", fetched }, "Factures entrantes récupérées");
            }
          } finally {
            await client.query(`SELECT pg_advisory_unlock(${LOCK_ID})`);
          }
        } finally {
          await client.end();
        }
      },
      (err) => {
        app.log.error({ event: "pa_inbound_poll_error", error: err instanceof Error ? err.message : String(err) }, "Erreur poller PA inbound");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ seconds: 3600, runImmediately: false }, task),
    );
  },
  { name: "pa-inbound-poller" },
);

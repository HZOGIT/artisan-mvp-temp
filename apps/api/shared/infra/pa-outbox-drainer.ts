import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { PaPort } from "../../modules/einvoicing/application/pa-port";
import type { DbClient } from "../db";
import { paOutbox, artisans as artisansTable, paEntites, factures as facturesTable } from "../../../../drizzle/schema.pg";
import type { PaInvoicePayload } from "../../modules/einvoicing/domain/einvoicing";
import { buildPaPayload } from "../../modules/einvoicing/application/facture-mapper";

const LOCK_ID = BigInt("0xb111d0cc");
export const MAX_TENTATIVES = 3;

export interface PaOutboxDrainerOptions {
  readonly pa: PaPort;
  readonly db: DbClient;
  /** APP_DATABASE_URL — connexion dédiée pour le pg_try_advisory_lock session-level. */
  readonly dbUrl: string;
}

type OutboxUpdate = { statut: string; traiteeAt?: Date; tentatives?: number; derniereErreur?: string };

/** Traite une entrée : soumet à la PA, marque sent ou failed/dead. Exporté pour test L1. */
export async function drainEntry(
  entry: { id: number; artisanId: number; factureId: number; tentatives: number | null },
  pa: PaPort,
  update: (id: number, set: OutboxUpdate) => Promise<void>,
  loadPayload: (factureId: number) => Promise<PaInvoicePayload>,
  loadPaEntityId: (artisanId: number) => Promise<string | null>,
  onSuccess?: (factureId: number, paDocumentId: string) => Promise<void>,
): Promise<void> {
  try {
    const paEntityId = await loadPaEntityId(entry.artisanId);
    if (!paEntityId) {
      await update(entry.id, { statut: "dead", derniereErreur: "artisan non provisionné PA" });
      return;
    }
    const payload = await loadPayload(entry.factureId);
    const result = await pa.submitInvoice({ paEntityId, invoiceId: entry.factureId, artisanId: entry.artisanId, payload });
    await update(entry.id, { statut: "sent", traiteeAt: new Date() });
    await onSuccess?.(entry.factureId, result.paDocumentId);
  } catch (err) {
    const tentatives = (entry.tentatives ?? 0) + 1;
    await update(entry.id, {
      statut: tentatives >= MAX_TENTATIVES ? "dead" : "failed",
      tentatives,
      derniereErreur: err instanceof Error ? err.message : String(err),
    });
  }
}

export const paOutboxDrainerPlugin = fp(
  (app: FastifyInstance, opts: PaOutboxDrainerOptions) => {
    const task = new AsyncTask(
      "pa-outbox-drain",
      async () => {
        /* ponytail: connexion dédiée hors pool — pg_try_advisory_lock session-level persiste pendant tout le drain */
        const client = new pg.Client({ connectionString: opts.dbUrl });
        await client.connect();
        try {
          const { rows } = await client.query(
            `SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`,
          );
          if (!(rows[0] as { acquired: boolean }).acquired) {
            app.log.debug({ event: "pa_outbox_lock_skipped" }, "PA outbox drain: lock non acquis, autre instance active");
            return;
          }
          try {
            const artisanRows = await opts.db.select({ id: artisansTable.id }).from(artisansTable);
            let totalProcessed = 0;
            for (const { id: artisanId } of artisanRows) {
              await opts.db.transaction(async (tx) => {
                await tx.execute(sql`SELECT set_config('app.tenant', ${String(artisanId)}, true)`);
                const pending = await tx
                  .select()
                  .from(paOutbox)
                  .where(and(inArray(paOutbox.statut, ["pending", "failed"]), lt(sql`coalesce(${paOutbox.tentatives}, 0)`, MAX_TENTATIVES)))
                  .limit(10);
                for (const entry of pending) {
                  await drainEntry(
                    entry,
                    opts.pa,
                    (id, set) => tx.update(paOutbox).set(set).where(eq(paOutbox.id, id)).then(() => {}),
                    (factureId) => buildPaPayload(opts.db, factureId),
                    (artisanId) =>
                      opts.db
                        .select({ paEntityId: paEntites.paEntityId })
                        .from(paEntites)
                        .where(eq(paEntites.artisanId, artisanId))
                        .then((rows) => rows[0]?.paEntityId ?? null),
                    (factureId, paDocumentId) =>
                      tx.update(facturesTable).set({ paDocumentId }).where(eq(facturesTable.id, factureId)).then(() => {}),
                  );
                }
                totalProcessed += pending.length;
              });
            }
            if (totalProcessed > 0) {
              app.log.info({ event: "pa_outbox_drain_done", processed: totalProcessed }, "PA outbox drainée");
            }
          } finally {
            await client.query(`SELECT pg_advisory_unlock(${LOCK_ID})`);
          }
        } finally {
          await client.end();
        }
      },
      (err) => {
        app.log.error({ event: "pa_outbox_drain_error", error: err instanceof Error ? err.message : String(err) }, "Erreur drainer PA outbox");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ seconds: 30, runImmediately: false }, task),
    );
  },
  { name: "pa-outbox-drainer" },
);

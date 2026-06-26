import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { PaPort } from "../../modules/einvoicing/application/pa-port";
import type { DbClient } from "../db";
import { paOutbox, artisans as artisansTable } from "../../../../drizzle/schema.pg";

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
): Promise<void> {
  try {
    await pa.submitInvoice({ paEntityId: String(entry.artisanId), invoiceId: entry.factureId });
    await update(entry.id, { statut: "sent", traiteeAt: new Date() });
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
                  .where(and(inArray(paOutbox.statut, ["pending", "failed"]), lt(paOutbox.tentatives!, MAX_TENTATIVES)))
                  .limit(10);
                for (const entry of pending) {
                  await drainEntry(entry, opts.pa, (id, set) =>
                    tx.update(paOutbox).set(set).where(eq(paOutbox.id, id)).then(() => {}),
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

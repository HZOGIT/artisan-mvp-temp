import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import type { PaPort } from "../../modules/einvoicing/application/pa-port";
import type { DbClient } from "../db";
import { artisans as artisansTable, factures as facturesTable, facturesCycleVieEvents } from "../../../../drizzle/schema.pg";
import type { LifecycleEvent } from "../../modules/einvoicing/domain/einvoicing";
import type { InsertFactureCycleVieEvent } from "../../../../drizzle/schema/einvoicing";

/* ponytail: lock différent du drainer outbox (0xb111d0cc) et du inbound (0xb111d1bb) — session-level évite le double-poll multi-réplica */
const LOCK_ID = BigInt("0xb111d3cc");
const TERMINAL_STATUTS = ["refusee", "rejetee", "encaissee"] as const;

export interface PaReconciliationPollerOptions {
  readonly pa: PaPort;
  readonly db: DbClient;
  readonly dbUrl: string;
}

/**
 * Insère les events PA d'une facture (idempotent via paEventId synthétique) et retourne
 * le statut du dernier event, ou null si aucun event. Exporté pour test L1.
 */
export async function reconcileFactureEvents(
  events: LifecycleEvent[],
  factureId: number,
  artisanId: number,
  insert: (values: InsertFactureCycleVieEvent) => Promise<void>,
): Promise<string | null> {
  if (events.length === 0) return null;

  for (const event of events) {
    /* paEventId synthétique déterministe — même event au re-poll → même clé → ON CONFLICT DO NOTHING */
    const paEventId = `reconcil:${event.paDocumentId}:${event.statut}:${event.timestamp.toISOString()}`;
    await insert({
      artisanId,
      factureId,
      statut: event.statut as InsertFactureCycleVieEvent["statut"],
      source: "pa",
      paEventId,
      occurredAt: event.timestamp,
    });
  }

  const [latest] = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return latest?.statut ?? null;
}

export const paReconciliationPollerPlugin = fp(
  (app: FastifyInstance, opts: PaReconciliationPollerOptions) => {
    const task = new AsyncTask(
      "pa-reconciliation-poll",
      async () => {
        const client = new pg.Client({ connectionString: opts.dbUrl });
        await client.connect();
        try {
          const { rows } = await client.query(
            `SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`,
          );
          if (!(rows[0] as { acquired: boolean }).acquired) {
            app.log.debug({ event: "pa_reconciliation_lock_skipped" }, "PA réconciliation: lock non acquis, autre instance active");
            return;
          }
          try {
            const artisanRows = await opts.db.select({ id: artisansTable.id }).from(artisansTable);
            let total = 0;
            let updated = 0;

            for (const { id: artisanId } of artisanRows) {
              await opts.db.transaction(async (tx) => {
                await tx.execute(sql`SELECT set_config('app.tenant', ${String(artisanId)}, true)`);

                const inflight = await tx
                  .select({ id: facturesTable.id, paDocumentId: facturesTable.paDocumentId })
                  .from(facturesTable)
                  .where(
                    and(
                      isNotNull(facturesTable.paDocumentId),
                      notInArray(facturesTable.statutCycleVie, [...TERMINAL_STATUTS]),
                    ),
                  );

                for (const facture of inflight) {
                  if (!facture.paDocumentId) continue;
                  total++;
                  const events = await opts.pa.getLifecycle(facture.paDocumentId, artisanId);
                  const newStatut = await reconcileFactureEvents(
                    events,
                    facture.id,
                    artisanId,
                    async (values) => {
                      await tx
                        .insert(facturesCycleVieEvents)
                        .values(values)
                        .onConflictDoNothing();
                    },
                  );
                  if (newStatut) {
                    await tx
                      .update(facturesTable)
                      .set({ statutCycleVie: newStatut as typeof facturesTable.$inferInsert["statutCycleVie"] })
                      .where(eq(facturesTable.id, facture.id));
                    updated++;
                  }
                }
              });
            }

            app.log.info({ event: "pa_reconciliation_done", total, updated }, "PA réconciliation terminée");
          } finally {
            await client.query(`SELECT pg_advisory_unlock(${LOCK_ID})`);
          }
        } finally {
          await client.end();
        }
      },
      (err) => {
        app.log.error(
          { event: "pa_reconciliation_error", error: err instanceof Error ? err.message : String(err) },
          "Erreur poller PA réconciliation",
        );
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ seconds: 3600, runImmediately: false }, task),
    );
  },
  { name: "pa-reconciliation-poller" },
);

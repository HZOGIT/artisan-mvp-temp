import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db";
import { eventOutbox, eventLog } from "../../../../drizzle/schema.pg";

export interface EventOutboxDrainerOptions {
  readonly db: DbClient;
}

/** Drain une passe de l'outbox events — exporté pour test L2. */
export async function runEventOutboxDrain(db: DbClient): Promise<number> {
  let drained = 0;
  await db.transaction(async (tx) => {
    /* ponytail: FOR UPDATE SKIP LOCKED — même pattern que email-outbox-drainer, évite les doublons event_log sur draineurs concurrents */
    const { rows } = await tx.execute<{
      id: number;
      artisanId: number;
      userId: number | null;
      entityType: string;
      entityId: number;
      action: string;
      payload: unknown;
      createdAt: string;
    }>(sql`
      SELECT id, "artisanId", "userId", "entityType", "entityId", action, payload, "createdAt"
      FROM event_outbox
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    `);
    if (!rows.length) return;

    drained = rows.length;
    await tx.insert(eventLog).values(
      rows.map((r) => ({
        artisanId: r.artisanId,
        userId: r.userId ?? null,
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        payload: r.payload ?? null,
        occurredAt: new Date(r.createdAt),
      })),
    );
    await tx.delete(eventOutbox).where(inArray(eventOutbox.id, rows.map((r) => r.id)));
  });
  return drained;
}

export const eventOutboxDrainerPlugin = fp(
  (app: FastifyInstance, opts: EventOutboxDrainerOptions) => {
    const task = new AsyncTask(
      "event-outbox-drain",
      async () => {
        const count = await runEventOutboxDrain(opts.db);
        if (count > 0) {
          app.log.info({ event: "event_outbox_drain_done", count }, "Events outbox drainée");
        }
      },
      (err) => {
        app.log.error(
          { event: "event_outbox_drain_error", error: err instanceof Error ? err.message : String(err) },
          "Erreur drainer events outbox",
        );
      },
    );

    app.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({ seconds: 5, runImmediately: false }, task));
  },
  { name: "event-outbox-drainer" },
);

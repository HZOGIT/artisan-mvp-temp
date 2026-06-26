import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db";
import { eventOutbox, eventLog } from "../../../../drizzle/schema.pg";

export interface EventOutboxDrainerOptions {
  readonly db: DbClient;
}

export const eventOutboxDrainerPlugin = fp(
  (app: FastifyInstance, opts: EventOutboxDrainerOptions) => {
    const task = new AsyncTask(
      "event-outbox-drain",
      async () => {
        const rows = await opts.db.select().from(eventOutbox).limit(50);
        if (!rows.length) return;

        const ids = rows.map((r) => r.id);
        await opts.db.transaction(async (tx) => {
          await tx.insert(eventLog).values(
            rows.map((r) => ({
              artisanId: r.artisanId,
              userId: r.userId ?? null,
              entityType: r.entityType,
              entityId: r.entityId,
              action: r.action,
              payload: r.payload ?? null,
              occurredAt: r.createdAt,
            })),
          );
          await tx.delete(eventOutbox).where(inArray(eventOutbox.id, ids));
        });

        app.log.info({ event: "event_outbox_drain_done", count: rows.length }, "Events outbox drainée");
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

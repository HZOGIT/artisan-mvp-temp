import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { FastifyInstance } from "fastify";
import { and, eq, lt, sql } from "drizzle-orm";
import type { EmailPort, EmailMessage } from "../ports/email";
import type { DbClient } from "../db";
import { emailOutbox } from "../../../../drizzle/schema.pg";

export const MAX_TENTATIVES = 3;

export interface EmailOutboxDrainerOptions {
  readonly db: DbClient;
  readonly sender: EmailPort;
}

export async function drainEmailEntry(
  entry: { id: number; toEmail: string; subject: string; html: string; fromName: string | null; replyTo: string | null; attachments: unknown; tentatives: number },
  sender: EmailPort,
  update: (id: number, set: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  try {
    const message: EmailMessage = {
      to: entry.toEmail,
      subject: entry.subject,
      body: entry.html,
      fromName: entry.fromName ?? undefined,
      replyTo: entry.replyTo ?? undefined,
    };
    await sender.send(message);
    await update(entry.id, { statut: "sent", traiteeAt: new Date() });
  } catch (err) {
    const tentatives = entry.tentatives + 1;
    await update(entry.id, {
      statut: tentatives >= MAX_TENTATIVES ? "dead" : "pending",
      tentatives,
      derniereErreur: err instanceof Error ? err.message : String(err),
    });
  }
}

export const emailOutboxDrainerPlugin = fp(
  (app: FastifyInstance, opts: EmailOutboxDrainerOptions) => {
    const task = new AsyncTask(
      "email-outbox-drain",
      async () => {
        const pending = await opts.db
          .select()
          .from(emailOutbox)
          .where(and(eq(emailOutbox.statut, "pending"), lt(sql`coalesce(${emailOutbox.tentatives}, 0)`, MAX_TENTATIVES)))
          .limit(10);

        let processed = 0;
        for (const entry of pending) {
          await drainEmailEntry(
            entry,
            opts.sender,
            (id, set) => opts.db.update(emailOutbox).set(set).where(eq(emailOutbox.id, id)).then(() => {}),
          );
          processed++;
        }
        if (processed > 0) {
          app.log.info({ event: "email_outbox_drain_done", processed }, "Email outbox drainée");
        }
      },
      (err) => {
        app.log.error({ event: "email_outbox_drain_error", error: err instanceof Error ? err.message : String(err) }, "Erreur drainer email outbox");
      },
    );

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob({ seconds: 120, runImmediately: false }, task),
    );
  },
  { name: "email-outbox-drainer" },
);

import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import type { EmailPort, EmailMessage } from "../ports/email";
import type { DbClient } from "../db";
import { emailOutbox } from "../../../../drizzle/schema.pg";

export const MAX_TENTATIVES = 3;

export interface EmailOutboxDrainerOptions {
  readonly db: DbClient;
  readonly sender: EmailPort;
}

type OutboxRow = {
  id: number;
  toEmail: string;
  subject: string;
  html: string;
  fromName: string | null;
  replyTo: string | null;
  attachments: unknown;
  tentatives: number;
};

export async function drainEmailEntry(
  entry: OutboxRow,
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
      idempotencyKey: `email-outbox-${entry.id}`,
    };
    await sender.send(message);
    await update(entry.id, { statut: "sent", traiteeAt: new Date() });
  } catch (err) {
    /* ponytail: best-effort — erreur stockée dans derniereErreur, tentatives tracées en BDD */
    const tentatives = entry.tentatives + 1;
    await update(entry.id, {
      statut: tentatives >= MAX_TENTATIVES ? "dead" : "pending",
      tentatives,
      derniereErreur: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Drain une passe de l'outbox email — exporté pour test L2. */
export async function runEmailOutboxDrain(db: DbClient, sender: EmailPort): Promise<number> {
  let processed = 0;
  await db.transaction(async (tx) => {
    /* ponytail: FOR UPDATE SKIP LOCKED — un seul replica traite chaque ligne, pas d'envoi double */
    const { rows } = await tx.execute<{
      id: number;
      to_email: string;
      subject: string;
      html: string;
      from_name: string | null;
      reply_to: string | null;
      attachments: unknown;
      tentatives: number;
    }>(sql`
      SELECT id, to_email, subject, html, from_name, reply_to, attachments, tentatives
      FROM email_outbox
      WHERE statut = 'pending' AND coalesce(tentatives, 0) < ${MAX_TENTATIVES}
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    `);

    if (!rows.length) return;

    for (const row of rows) {
      await drainEmailEntry(
        {
          id: row.id,
          toEmail: row.to_email,
          subject: row.subject,
          html: row.html,
          fromName: row.from_name,
          replyTo: row.reply_to,
          attachments: row.attachments,
          tentatives: row.tentatives,
        },
        sender,
        (id, set) => tx.update(emailOutbox).set(set).where(eq(emailOutbox.id, id)).then(() => {}),
      );
      processed++;
    }
  });
  return processed;
}

export const emailOutboxDrainerPlugin = fp(
  (app: FastifyInstance, opts: EmailOutboxDrainerOptions) => {
    const task = new AsyncTask(
      "email-outbox-drain",
      async () => {
        const processed = await runEmailOutboxDrain(opts.db, opts.sender);
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

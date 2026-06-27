import type { EmailPort, EmailMessage } from "../ports/email";
import type { DbClient } from "../db";
import type { AppLogger } from "../ports/logger";
import { emailOutbox } from "../../../../drizzle/schema.pg";

export class EmailOutboxAdapter implements EmailPort {
  constructor(private readonly db: DbClient, private readonly log: AppLogger) {}

  async send(message: EmailMessage): Promise<void> {
    await this.db.insert(emailOutbox).values({
      toEmail: message.to,
      subject: message.subject,
      html: message.body,
      fromName: message.fromName ?? null,
      replyTo: message.replyTo ?? null,
      attachments: message.attachments ? (message.attachments as unknown as Record<string, unknown>[]) : null,
    });
    this.log.info({ event: "email_queued", subject: message.subject }, "Email mis en file outbox");
  }
}

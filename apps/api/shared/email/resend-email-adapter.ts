import { Resend } from "resend";
import type { EmailPort, EmailMessage } from "../ports/email";
import type { AppLogger } from "../ports/logger";
import { ConsoleLogger } from "../ports/logger";
import { maskEmail } from "../mask-email";

/*
 * Adapter email INTERNALISÉ dans le new-stack (remplace LegacyEmailAdapter/sidecar legacy-email.mjs).
 * Implémente directement EmailPort via Resend. Config par env (RESEND_API_KEY/EMAIL_FROM). Fidèle au
 * comportement legacy au niveau du contrat EmailPort (from/replyTo par défaut Operioz — le boundary
 * EmailMessage ne portait déjà ni identité artisan ni reply-to). Simulation si Resend non configuré.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Operioz <noreply@operioz.com>";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeCRLF(s: string): string {
  return s.replace(/[\r\n]/g, " ").replace(/[<>"]/g, "");
}

export class ResendEmailAdapter implements EmailPort {
  private readonly log: AppLogger;

  constructor(logger?: AppLogger) {
    this.log = logger ?? new ConsoleLogger();
    if (!resend) {
      this.log.warn({ event: "email_no_resend_key" }, "RESEND_API_KEY non configuré — emails simulés");
    }
  }

  async send(message: EmailMessage): Promise<void> {
    const { to, subject, body } = message;
    if (!to || !subject || !body) throw new Error("Paramètres d'email manquants");
    if (!EMAIL_RE.test(to)) throw new Error("Adresse email invalide");
    if (!resend) {
      if (process.env.NODE_ENV === "production") {
        this.log.error({ event: "email_not_configured", to: maskEmail(to), subject }, "RESEND_API_KEY non configuré en production");
        throw new Error("Service email non configuré");
      }
      this.log.warn({ event: "email_simulated", to: maskEmail(to), subject }, "Email simulé (Resend non configuré)");
      return;
    }
    const options: Parameters<typeof resend.emails.send>[0] = {
      from: message.fromName ? `${sanitizeCRLF(message.fromName)} <noreply@operioz.com>` : EMAIL_FROM,
      replyTo: message.replyTo && EMAIL_RE.test(message.replyTo) ? sanitizeCRLF(message.replyTo) : "support@operioz.com",
      to,
      subject,
      html: body,
    };
    if (message.attachments?.length) {
      options.attachments = message.attachments.map((a) => ({ filename: a.filename, content: a.content }));
    }
    const { error } = await resend.emails.send(options);
    if (error) {
      this.log.error({ event: "email_send_error", to: maskEmail(to), subject, error: error.message }, "Échec envoi email");
      throw new Error(`Échec envoi email : ${error.message}`);
    }
    this.log.info({ event: "email_sent", to: maskEmail(to), subject }, "Email envoyé");
  }
}

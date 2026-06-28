import { Resend } from "resend";
import type { EmailPort, EmailMessage } from "../ports/email";
import type { AppLogger } from "../ports/logger";
import { ConsoleLogger } from "../ports/logger";
import { maskEmail } from "../mask-email";
import { getSecret } from "../config/secrets";

/*
 * Adapter email internalisé via Resend. Initialisation paresseuse (lecture des secrets au
 * moment de la construction de l'instance, après hydrateSecrets()) pour permettre l'injection
 * Bitwarden. Simulation si RESEND_API_KEY absent.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeCRLF(s: string): string {
  return s.replace(/[\r\n]/g, " ").replace(/[<>"]/g, "");
}

export class ResendEmailAdapter implements EmailPort {
  private readonly log: AppLogger;
  private readonly resend: Resend | null;
  private readonly emailFrom: string;

  constructor(logger?: AppLogger) {
    this.log = logger ?? new ConsoleLogger();
    const apiKey = getSecret("RESEND_API_KEY");
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.emailFrom = getSecret("EMAIL_FROM") ?? "Operioz <noreply@operioz.com>";
    if (!this.resend) {
      this.log.warn({ event: "email_no_resend_key" }, "RESEND_API_KEY non configuré — emails simulés");
    }
  }

  async send(message: EmailMessage): Promise<void> {
    const { to, subject, body } = message;
    if (!to || !subject || !body) throw new Error("Paramètres d'email manquants");
    if (!EMAIL_RE.test(to)) throw new Error("Adresse email invalide");
    if (!this.resend) {
      if (getSecret("NODE_ENV") === "production") {
        this.log.error({ event: "email_not_configured", to: maskEmail(to), subject }, "RESEND_API_KEY non configuré en production");
        throw new Error("Service email non configuré");
      }
      this.log.warn({ event: "email_simulated", to: maskEmail(to), subject }, "Email simulé (Resend non configuré)");
      return;
    }
    const options: Parameters<typeof this.resend.emails.send>[0] = {
      from: message.fromName ? `${sanitizeCRLF(message.fromName)} <noreply@operioz.com>` : this.emailFrom,
      replyTo: message.replyTo && EMAIL_RE.test(message.replyTo) ? sanitizeCRLF(message.replyTo) : "support@operioz.com",
      to,
      subject,
      html: body,
    };
    if (message.attachments?.length) {
      options.attachments = message.attachments.map((a) => ({ filename: a.filename, content: a.content }));
    }
    const { error } = await this.resend.emails.send(options);
    if (error) {
      this.log.error({ event: "email_send_error", to: maskEmail(to), subject, error: error.message }, "Échec envoi email");
      throw new Error(`Échec envoi email : ${error.message}`);
    }
    this.log.info({ event: "email_sent", to: maskEmail(to), subject }, "Email envoyé");
  }
}

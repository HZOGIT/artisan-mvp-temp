import { Resend } from "resend";
import type { EmailPort, EmailMessage } from "../ports/email";

// Adapter email INTERNALISÉ dans le new-stack (remplace LegacyEmailAdapter/sidecar legacy-email.mjs).
// Implémente directement EmailPort via Resend. Config par env (RESEND_API_KEY/EMAIL_FROM). Fidèle au
// comportement legacy au niveau du contrat EmailPort (from/replyTo par défaut Operioz — le boundary
// EmailMessage ne portait déjà ni identité artisan ni reply-to). Simulation si Resend non configuré.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Operioz <noreply@operioz.com>";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!resend) console.warn("[Email] RESEND_API_KEY non configuré — les emails seront simulés (console.log)");

export class ResendEmailAdapter implements EmailPort {
  async send(message: EmailMessage): Promise<void> {
    const { to, subject, body } = message;
    if (!to || !subject || !body) throw new Error("Paramètres d'email manquants");
    if (!EMAIL_RE.test(to)) throw new Error("Adresse email invalide");
    if (!resend) { console.log(`[Email][SIM] → ${to} | ${subject}`); return; }
    const options: Parameters<typeof resend.emails.send>[0] = {
      from: EMAIL_FROM,
      replyTo: "support@operioz.com",
      to,
      subject,
      html: body,
    };
    if (message.attachments?.length) {
      options.attachments = message.attachments.map((a) => ({ filename: a.filename, content: a.content }));
    }
    const { error } = await resend.emails.send(options);
    if (error) throw new Error(`Échec envoi email : ${error.message}`);
  }
}

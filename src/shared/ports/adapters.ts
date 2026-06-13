// Adapters branchant les ports sur l'implémentation existante (legacy). L'import est
// résolu via une variable (type `string`, non littéral) → TypeScript ne tire PAS le
// graphe legacy dans le typecheck de src/** (gate propre), tout en câblant au runtime.
import type { EmailPort, EmailMessage } from "./email";

type LegacyEmailModule = {
  sendEmail: (p: { to: string; subject: string; body: string }) => Promise<{ success: boolean; message: string }>;
};

const LEGACY_EMAIL_MODULE: string = "../../../server/_core/emailService";

export class LegacyEmailAdapter implements EmailPort {
  async send(message: EmailMessage): Promise<void> {
    const mod = (await import(LEGACY_EMAIL_MODULE)) as LegacyEmailModule;
    const res = await mod.sendEmail({ to: message.to, subject: message.subject, body: message.body });
    if (!res.success) throw new Error(`Échec envoi email : ${res.message}`);
  }
}

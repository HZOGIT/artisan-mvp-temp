// Adapters branchant les ports sur l'implémentation existante (legacy). L'import est
// résolu via une variable (type `string`, non littéral) → TypeScript ne tire PAS le
// graphe legacy dans le typecheck de src/** (gate propre), tout en câblant au runtime.
import type { EmailPort, EmailMessage } from "./email";
import type { PdfPort } from "./pdf";

type LegacyEmailModule = {
  sendEmail: (p: {
    to: string;
    subject: string;
    body: string;
    attachmentName?: string;
    attachmentContent?: string; // base64
  }) => Promise<{ success: boolean; message: string }>;
};

const LEGACY_EMAIL_MODULE: string = "../../../server/_core/emailService";

export class LegacyEmailAdapter implements EmailPort {
  async send(message: EmailMessage): Promise<void> {
    const mod = (await import(LEGACY_EMAIL_MODULE)) as LegacyEmailModule;
    // Le helper legacy `sendEmail` accepte UNE pièce jointe (attachmentName/attachmentContent
    // base64). On y mappe la 1re pièce jointe (les use-cases n'en envoient qu'une — le PDF du doc).
    const att = message.attachments?.[0];
    const res = await mod.sendEmail({
      to: message.to,
      subject: message.subject,
      body: message.body,
      ...(att ? { attachmentName: att.filename, attachmentContent: att.content.toString("base64") } : {}),
    });
    if (!res.success) throw new Error(`Échec envoi email : ${res.message}`);
  }
}

// Adapter PDF : route `render(template, data)` vers les générateurs legacy (facture/devis/bon de
// commande). Import via variable-de-chemin (le graphe legacy n'est PAS tiré dans le gate tsc src/**).
type LegacyPdfModule = {
  generateFacturePDF: (data: unknown) => Buffer;
  generateDevisPDF: (data: unknown) => Buffer;
  generateBonCommandePDF: (data: unknown) => Buffer;
};

const LEGACY_PDF_MODULE: string = "../../../server/_core/pdfGenerator";

export class LegacyPdfAdapter implements PdfPort {
  async render(template: string, data: Record<string, unknown>): Promise<Buffer> {
    const mod = (await import(LEGACY_PDF_MODULE)) as LegacyPdfModule;
    switch (template) {
      case "facture":
        return mod.generateFacturePDF(data);
      case "devis":
        return mod.generateDevisPDF(data);
      case "bon-commande":
        return mod.generateBonCommandePDF(data);
      default:
        throw new Error(`Template PDF inconnu : ${template}`);
    }
  }
}

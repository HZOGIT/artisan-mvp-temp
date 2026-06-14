// Adapters branchant les ports sur l'implémentation existante (legacy). L'import est
// résolu via une variable (type `string`, non littéral) → TypeScript ne tire PAS le
// graphe legacy dans le typecheck de src/** (gate propre), tout en câblant au runtime.
import type { EmailPort, EmailMessage } from "./email";
import type { PdfPort } from "./pdf";
import type { LlmPort, LlmCompleteOptions } from "./llm";

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

// Adapter LLM sur Google GenAI (Gemini). Import via variable-de-chemin (string non-littéral) → le
// SDK n'est PAS tiré dans le typecheck de src/** ; on type structurellement ce qu'on utilise. La clé
// vient de l'env (`GEMINI_API_KEY`), jamais committée. Modèle par défaut `gemini-2.5-flash`.
type GenAiClient = {
  models: {
    generateContent(req: unknown): Promise<{ text?: string }>;
    generateContentStream(req: unknown): Promise<AsyncIterable<{ text?: string }>>;
  };
};
type GenAiModule = { GoogleGenAI: new (opts: { apiKey: string }) => GenAiClient };

const GENAI_MODULE: string = "@google/genai";

export class GeminiLlmAdapter implements LlmPort {
  private async client(): Promise<GenAiClient> {
    const mod = (await import(GENAI_MODULE)) as GenAiModule;
    return new mod.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
  }

  private request(prompt: string, opts?: LlmCompleteOptions) {
    return {
      // Modèle le plus récent/capable par défaut (Gemini 3 Pro) ; surchargé par l'env
      // `GEMINI_TEXT_MODEL` (staging) ou par `opts.model` au cas par cas.
      model: opts?.model ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-3-pro-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        ...(opts?.system ? { systemInstruction: opts.system } : {}),
        temperature: opts?.temperature ?? 0.4,
        maxOutputTokens: opts?.maxOutputTokens ?? 1000,
      },
    };
  }

  async complete(prompt: string, opts?: LlmCompleteOptions): Promise<string> {
    const ai = await this.client();
    const res = await ai.models.generateContent(this.request(prompt, opts));
    return res.text ?? "";
  }

  async *stream(prompt: string, opts?: LlmCompleteOptions): AsyncIterable<string> {
    const ai = await this.client();
    const s = await ai.models.generateContentStream(this.request(prompt, opts));
    for await (const chunk of s) {
      if (chunk.text) yield chunk.text;
    }
  }
}

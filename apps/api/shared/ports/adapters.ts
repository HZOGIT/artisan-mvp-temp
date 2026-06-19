/*
 * Adapters branchant les ports sur l'implémentation existante (legacy). L'import est
 * résolu via une variable (type `string`, non littéral) → TypeScript ne tire PAS le
 * graphe legacy dans le typecheck de src/** (gate propre), tout en câblant au runtime.
 */
import type { LlmPort, LlmCompleteOptions } from "./llm";
import type { VisionPort, VisionRequest, VisionMultiRequest } from "./vision";

/*
 * Adapter LLM sur Google GenAI (Gemini). Import via variable-de-chemin (string non-littéral) → le
 * SDK n'est PAS tiré dans le typecheck de src/** ; on type structurellement ce qu'on utilise. La clé
 * vient de l'env (`GEMINI_API_KEY`), jamais committée. Modèle par défaut `gemini-2.5-flash`.
 */
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
      /*
       * Modèle le plus récent/capable par défaut (Gemini 3 Pro) ; surchargé par l'env
       * `GEMINI_TEXT_MODEL` (staging) ou par `opts.model` au cas par cas.
       */
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

/*
 * Adapter vision sur Gemini : image transmise en `inlineData` (mimeType + base64) + prompt texte.
 * Même import variable-de-chemin que GeminiLlmAdapter (graphe SDK hors typecheck src).
 */
export class GeminiVisionAdapter implements VisionPort {
  async analyzeImage(req: VisionRequest): Promise<string> {
    const mod = (await import(GENAI_MODULE)) as GenAiModule;
    const ai = new mod.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
    const res = await ai.models.generateContent({
      model: req.model ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-3-pro-preview",
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: req.mimeType, data: req.base64 } }, { text: req.prompt }] }],
      config: {
        ...(req.system ? { systemInstruction: req.system } : {}),
        maxOutputTokens: req.maxOutputTokens ?? 1000,
      },
    });
    return res.text ?? "";
  }

  async analyzeImages(req: VisionMultiRequest): Promise<string> {
    const mod = (await import(GENAI_MODULE)) as GenAiModule;
    const ai = new mod.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
    const imageParts = req.images.map((img) =>
      img.base64 !== undefined ? { inlineData: { mimeType: img.mimeType, data: img.base64 } } : { fileData: { mimeType: img.mimeType, fileUri: img.fileUri ?? "" } },
    );
    const res = await ai.models.generateContent({
      model: req.model ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-3-pro-preview",
      contents: [{ role: "user", parts: [...imageParts, { text: req.prompt }] }],
      config: {
        ...(req.system ? { systemInstruction: req.system } : {}),
        maxOutputTokens: req.maxOutputTokens ?? 1000,
      },
    });
    return res.text ?? "";
  }
}

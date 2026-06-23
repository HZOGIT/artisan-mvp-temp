/*
 * Adapters branchant les ports sur l'implémentation existante (legacy). L'import est
 * résolu via une variable (type `string`, non littéral) → TypeScript ne tire PAS le
 * graphe legacy dans le typecheck de src/** (gate propre), tout en câblant au runtime.
 */
import type { LlmPort, LlmCompleteOptions, LlmResult, LlmUsage, LlmStreamChunk } from "./llm";
import type { VisionPort, VisionRequest, VisionMultiRequest } from "./vision";

/** Forme structurelle du usageMetadata retourné par le SDK @google/genai v1.52. */
type GeminiUsageMeta = {
  promptTokenCount?: number;
  /** responseTokenCount (Gemini API) OU candidatesTokenCount (Vertex / anciens endpoints). */
  responseTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: { modality?: string; tokenCount?: number }[];
  responseTokensDetails?: { modality?: string; tokenCount?: number }[];
  trafficType?: string;
};

type GenAiResponse = { text?: string; candidates?: { finishReason?: string }[]; usageMetadata?: GeminiUsageMeta };
type GenAiStreamChunk = { text?: string; usageMetadata?: GeminiUsageMeta };

type GenAiClient = {
  models: {
    generateContent(req: unknown): Promise<GenAiResponse>;
    generateContentStream(req: unknown): Promise<AsyncIterable<GenAiStreamChunk>>;
  };
};
type GenAiModule = { GoogleGenAI: new (opts: { apiKey: string }) => GenAiClient };

const GENAI_MODULE: string = "@google/genai";

/** Extrait le tokenCount d'une modalité donnée dans un tableau de détails. */
function modalityTokens(details: { modality?: string; tokenCount?: number }[] | undefined, modality: string): number {
  return details?.find((d) => d.modality === modality)?.tokenCount ?? 0;
}

/** Construit un `LlmUsage` à partir de usageMetadata SDK + contexte de l'appel. */
function buildUsage(
  meta: GeminiUsageMeta | undefined,
  model: string,
  durationMs: number,
  finishReason: string,
): LlmUsage {
  return {
    model,
    durationMs,
    finishReason,
    promptTokens:    meta?.promptTokenCount         ?? 0,
    responseTokens:  meta?.responseTokenCount ?? meta?.candidatesTokenCount ?? 0,
    thinkingTokens:  meta?.thoughtsTokenCount        ?? 0,
    cachedTokens:    meta?.cachedContentTokenCount   ?? 0,
    toolUseTokens:   meta?.toolUsePromptTokenCount   ?? 0,
    totalTokens:     meta?.totalTokenCount           ?? 0,
    textInputTokens:  modalityTokens(meta?.promptTokensDetails,   "TEXT"),
    audioInputTokens: modalityTokens(meta?.promptTokensDetails,   "AUDIO"),
    imageInputTokens: modalityTokens(meta?.promptTokensDetails,   "IMAGE"),
    videoInputTokens: modalityTokens(meta?.promptTokensDetails,   "VIDEO"),
    textOutputTokens:  modalityTokens(meta?.responseTokensDetails, "TEXT"),
    audioOutputTokens: modalityTokens(meta?.responseTokensDetails, "AUDIO"),
    trafficType: meta?.trafficType ?? null,
  };
}

/*
 * Adapter LLM sur Google GenAI (Gemini). Import via variable-de-chemin (string non-littéral) → le
 * SDK n'est PAS tiré dans le typecheck de src/** ; on type structurellement ce qu'on utilise.
 */
export class GeminiLlmAdapter implements LlmPort {
  private async client(): Promise<GenAiClient> {
    const mod = (await import(GENAI_MODULE)) as GenAiModule;
    return new mod.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
  }

  private resolvedModel(opts?: LlmCompleteOptions): string {
    return opts?.model ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-3-pro-preview";
  }

  private request(prompt: string, opts?: LlmCompleteOptions) {
    return {
      model: this.resolvedModel(opts),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        ...(opts?.system ? { systemInstruction: opts.system } : {}),
        temperature: opts?.temperature ?? 0.4,
        maxOutputTokens: opts?.maxOutputTokens ?? 1000,
      },
    };
  }

  async complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResult> {
    const ai = await this.client();
    const req = this.request(prompt, opts);
    /*
     * Thinking models (gemini-3.x+) consomment le budget maxOutputTokens avec leurs tokens de
     * réflexion, ne laissant presque rien pour la sortie JSON. Désactivé pour les completions
     * structurées (pas besoin de chain-of-thought).
     */
    (req.config as Record<string, unknown>).thinkingConfig = { thinkingBudget: 0 };
    const t0 = Date.now();
    const res = await ai.models.generateContent(req);
    const durationMs = Date.now() - t0;
    const finishReason = res.candidates?.[0]?.finishReason ?? "STOP";
    return {
      text: res.text ?? "",
      usage: buildUsage(res.usageMetadata, this.resolvedModel(opts), durationMs, finishReason),
    };
  }

  async *stream(prompt: string, opts?: LlmCompleteOptions): AsyncIterable<LlmStreamChunk> {
    const ai = await this.client();
    const model = this.resolvedModel(opts);
    const t0 = Date.now();
    const s = await ai.models.generateContentStream(this.request(prompt, opts));
    let lastMeta: GeminiUsageMeta | undefined;
    let finishReason = "STREAM_END";
    for await (const chunk of s) {
      if (chunk.text) yield { kind: "text", text: chunk.text };
      if (chunk.usageMetadata) lastMeta = chunk.usageMetadata;
    }
    yield { kind: "done", usage: buildUsage(lastMeta, model, Date.now() - t0, finishReason) };
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

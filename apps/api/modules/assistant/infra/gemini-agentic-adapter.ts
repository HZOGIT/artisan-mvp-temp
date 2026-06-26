import type { AgenticEvent, AgenticFunctionCall, AgenticMessage, AgenticTurnInput, LlmAgenticPort } from "../application/agentic-port";
import type { ToolParamSchema, ToolSchema } from "../domain/assistant-tools-catalog";
import type { LlmUsage } from "../../../shared/ports/llm";
import { type AppLogger, ConsoleLogger } from "../../../shared/ports/logger";

/*
 * Adapter Gemini du port AGENTIQUE (function-calling streamé). Comme `GeminiLlmAdapter`, le SDK est
 * importé par CHEMIN VARIABLE (`GENAI_MODULE`, type `string`) → hors graphe de typecheck `src`. Les
 * mappers `toGeminiTools`/`toGeminiContents` sont PURS et testés sans réseau ; `streamTurn` fait l'I/O.
 */

/** ── Types minimaux du SDK (runtime via import variable-de-chemin) ────────────────────────────── */
interface GenAiPart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  inlineData?: { data: string; mimeType: string };
}
type GenAiUsageMeta = {
  promptTokenCount?: number;
  responseTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number; toolUsePromptTokenCount?: number; totalTokenCount?: number;
  promptTokensDetails?: { modality?: string; tokenCount?: number }[];
  responseTokensDetails?: { modality?: string; tokenCount?: number }[];
  trafficType?: string;
};
interface GenAiStreamChunk {
  candidates?: Array<{ content?: { parts?: GenAiPart[] }; finishReason?: string }>;
  usageMetadata?: GenAiUsageMeta;
}
interface GenAiAgenticClient {
  models: { generateContentStream(req: unknown): Promise<AsyncIterable<GenAiStreamChunk>> };
}
interface GenAiModule {
  GoogleGenAI: new (opts: { apiKey: string }) => GenAiAgenticClient;
}
const GENAI_MODULE: string = "@google/genai";

/** Contenu interne d'un `AgenticMessage` (le port le tient opaque ; ici on connaît les variantes). */
type AgenticContent =
  | { kind: "text"; text: string }
  | { kind: "tool-results"; results: ReadonlyArray<{ name: string; response: unknown }> }
  | { kind: "raw"; parts: unknown[] }
  | { kind: "parts"; parts: ReadonlyArray<{ text?: string; inlineData?: { data: string; mimeType: string } }> };

/** ── Mappers PURS (testables) ─────────────────────────────────────────────────────────────────── */

/*
 * `ToolParamSchema` neutre → schéma de paramètres Gemini (le type devient MAJUSCULE : `Type.OBJECT`
 * est la string "OBJECT" dans `@google/genai`, donc "object" → "OBJECT" sans importer l'enum).
 */
export function toGeminiParam(p: ToolParamSchema): Record<string, unknown> {
  return {
    type: p.type.toUpperCase(),
    ...(p.description ? { description: p.description } : {}),
    ...(p.properties ? { properties: Object.fromEntries(Object.entries(p.properties).map(([k, v]) => [k, toGeminiParam(v)])) } : {}),
    ...(p.items ? { items: toGeminiParam(p.items) } : {}),
    ...(p.required ? { required: [...p.required] } : {}),
  };
}

export function toGeminiFunctionDeclaration(tool: ToolSchema): Record<string, unknown> {
  return { name: tool.name, description: tool.description, parameters: toGeminiParam(tool.parameters) };
}

/** Outils → config `tools: [{ functionDeclarations }]`. Vide si aucun outil (on omettra la clé). */
export function toGeminiTools(tools: readonly ToolSchema[]): unknown[] {
  if (tools.length === 0) return [];
  return [{ functionDeclarations: tools.map(toGeminiFunctionDeclaration) }];
}

/*
 * Messages agentiques → `contents` Gemini. user/historique `text` → parts texte ; `tool` → parts
 * `functionResponse` (role `user`, parité legacy) ; `model` brut → parts BRUTES round-trip (conserve
 * le `thoughtSignature` Gemini 3.x, requis au tour suivant sous peine de 400).
 */
export function toGeminiContents(messages: readonly AgenticMessage[]): unknown[] {
  return messages.map((m) => {
    const c = m.content as AgenticContent;
    if (m.role === "tool") {
      const results = c.kind === "tool-results" ? c.results : [];
      return { role: "user", parts: results.map((r) => ({ functionResponse: { name: r.name, response: r.response } })) };
    }
    if (m.role === "model") {
      if (c.kind === "raw") return { role: "model", parts: c.parts };
      return { role: "model", parts: [{ text: c.kind === "text" ? c.text : "" }] };
    }
    if (c.kind === "parts") return { role: "user", parts: c.parts };
    return { role: "user", parts: [{ text: c.kind === "text" ? c.text : "" }] };
  });
}

/** ── Adapter ────────────────────────────────────────────────────────────────────────────────── */
export class GeminiAgenticAdapter implements LlmAgenticPort {
  private readonly log: AppLogger;
  private ai: GenAiAgenticClient | null = null;

  constructor(log?: AppLogger) {
    this.log = log ?? new ConsoleLogger();
  }

  private async getAi(): Promise<GenAiAgenticClient> {
    if (!this.ai) {
      const mod = (await import(GENAI_MODULE)) as GenAiModule;
      this.ai = new mod.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
    }
    return this.ai;
  }

  async *streamTurn(input: AgenticTurnInput): AsyncIterable<AgenticEvent> {
    const ai = await this.getAi();
    const model = input.model ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-3-pro-preview";
    this.log.info({ event: "gemini_model_resolved", model }, "Modèle Gemini résolu");
    const tools = toGeminiTools(input.tools);
    const t0 = Date.now();

    try {
      this.log.info({ event: "llm_agentic_turn_start", model }, "Début turn agentique");
      const stream = await ai.models.generateContentStream({
        model,
        contents: toGeminiContents(input.messages),
        config: {
          systemInstruction: input.system,
          ...(tools.length ? { tools } : {}),
          maxOutputTokens: 2000,
          temperature: 0.7,
        },
      });

      /** Parts BRUTES du tour `model` (texte + functionCall avec thoughtSignature) à réinjecter tel quel. */
      const rawFunctionCallParts: unknown[] = [];
      const functionCalls: AgenticFunctionCall[] = [];
      let textBuffer = "";
      let lastMeta: GenAiUsageMeta | undefined;
      let finishReason = "STOP";

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        if (chunk.candidates?.[0]?.finishReason) finishReason = chunk.candidates[0].finishReason;
        if (chunk.usageMetadata) lastMeta = chunk.usageMetadata;
        for (const part of parts) {
          if (typeof part.text === "string" && part.text) {
            textBuffer += part.text;
            yield { kind: "text", text: part.text };
          }
          if (part.functionCall) {
            functionCalls.push({ name: part.functionCall.name ?? "", args: part.functionCall.args ?? {} });
            rawFunctionCallParts.push(part);
          }
        }
      }

      const modelParts: unknown[] = [];
      if (textBuffer) modelParts.push({ text: textBuffer });
      for (const p of rawFunctionCallParts) modelParts.push(p);
      const modelMessage: AgenticMessage = { role: "model", content: { kind: "raw", parts: modelParts } };

      const mt = (arr: { modality?: string; tokenCount?: number }[] | undefined, m: string) =>
        arr?.find((d) => d.modality === m)?.tokenCount ?? 0;
      const durationMs = Date.now() - t0;
      const usage: LlmUsage = {
        model, durationMs, finishReason,
        promptTokens:    lastMeta?.promptTokenCount         ?? 0,
        responseTokens:  lastMeta?.responseTokenCount ?? lastMeta?.candidatesTokenCount ?? 0,
        thinkingTokens:  lastMeta?.thoughtsTokenCount        ?? 0,
        cachedTokens:    lastMeta?.cachedContentTokenCount   ?? 0,
        toolUseTokens:   lastMeta?.toolUsePromptTokenCount   ?? 0,
        totalTokens:     lastMeta?.totalTokenCount           ?? 0,
        textInputTokens:  mt(lastMeta?.promptTokensDetails,  "TEXT"),
        audioInputTokens: mt(lastMeta?.promptTokensDetails,  "AUDIO"),
        imageInputTokens: mt(lastMeta?.promptTokensDetails,  "IMAGE"),
        videoInputTokens: mt(lastMeta?.promptTokensDetails,  "VIDEO"),
        textOutputTokens:  mt(lastMeta?.responseTokensDetails, "TEXT"),
        audioOutputTokens: mt(lastMeta?.responseTokensDetails, "AUDIO"),
        trafficType: lastMeta?.trafficType ?? null,
      };
      this.log.info({ event: "llm_agentic_turn_complete", model, durationMs, promptTokens: usage.promptTokens, responseTokens: usage.responseTokens, finishReason }, "Turn agentique terminé");
      yield { kind: "turn-complete", modelMessage, functionCalls, usage };
    } catch (err) {
      const durationMs = Date.now() - t0;
      if ((err as { status?: number }).status === 429) {
        this.log.warn({ event: "llm_rate_limit", model, durationMs, err }, "Rate limit Gemini");
      } else {
        this.log.error({ event: "llm_agentic_turn_error", model, durationMs, err }, "Erreur turn agentique");
      }
      throw err;
    }
  }
}

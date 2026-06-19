import type { AgenticEvent, AgenticFunctionCall, AgenticMessage, AgenticTurnInput, LlmAgenticPort } from "../application/agentic-port";
import type { ToolParamSchema, ToolSchema } from "../domain/assistant-tools-catalog";

/*
 * Adapter Gemini du port AGENTIQUE (function-calling streamé). Comme `GeminiLlmAdapter`, le SDK est
 * importé par CHEMIN VARIABLE (`GENAI_MODULE`, type `string`) → hors graphe de typecheck `src`. Les
 * mappers `toGeminiTools`/`toGeminiContents` sont PURS et testés sans réseau ; `streamTurn` fait l'I/O.
 */

// ── Types minimaux du SDK (runtime via import variable-de-chemin) ──────────────────────────────
interface GenAiPart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
}
interface GenAiStreamChunk {
  candidates?: Array<{ content?: { parts?: GenAiPart[] } }>;
}
interface GenAiAgenticClient {
  models: { generateContentStream(req: unknown): Promise<AsyncIterable<GenAiStreamChunk>> };
}
interface GenAiModule {
  GoogleGenAI: new (opts: { apiKey: string }) => GenAiAgenticClient;
}
const GENAI_MODULE: string = "@google/genai";

// Contenu interne d'un `AgenticMessage` (le port le tient opaque ; ici on connaît les variantes).
type AgenticContent =
  | { kind: "text"; text: string }
  | { kind: "tool-results"; results: ReadonlyArray<{ name: string; response: unknown }> }
  | { kind: "raw"; parts: unknown[] };

// ── Mappers PURS (testables) ───────────────────────────────────────────────────────────────────

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

// Outils → config `tools: [{ functionDeclarations }]`. Vide si aucun outil (on omettra la clé).
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
    return { role: "user", parts: [{ text: c.kind === "text" ? c.text : "" }] };
  });
}

// ── Adapter ──────────────────────────────────────────────────────────────────────────────────
export class GeminiAgenticAdapter implements LlmAgenticPort {
  async *streamTurn(input: AgenticTurnInput): AsyncIterable<AgenticEvent> {
    const mod = (await import(GENAI_MODULE)) as GenAiModule;
    const ai = new mod.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
    const model = input.model ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-3-pro-preview";
    const tools = toGeminiTools(input.tools);

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

    // Parts BRUTES du tour `model` (texte + functionCall avec thoughtSignature) à réinjecter tel quel.
    const rawFunctionCallParts: unknown[] = [];
    const functionCalls: AgenticFunctionCall[] = [];
    let textBuffer = "";

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text === "string" && part.text) {
          textBuffer += part.text;
          yield { kind: "text", text: part.text };
        }
        if (part.functionCall) {
          functionCalls.push({ name: part.functionCall.name ?? "", args: part.functionCall.args ?? {} });
          rawFunctionCallParts.push(part); // brute (incl. thoughtSignature)
        }
      }
    }

    const modelParts: unknown[] = [];
    if (textBuffer) modelParts.push({ text: textBuffer });
    for (const p of rawFunctionCallParts) modelParts.push(p);
    const modelMessage: AgenticMessage = { role: "model", content: { kind: "raw", parts: modelParts } };
    yield { kind: "turn-complete", modelMessage, functionCalls };
  }
}

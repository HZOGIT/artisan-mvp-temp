import { TooManyRequestsError, ValidationError } from "../../../shared/errors";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import type { TenantContext } from "../../../shared/tenant";
import type { ConseilsStatsReader } from "../../conseils-ia/application/conseils-stats-reader";
import { isWriteTool, TOOL_INVALIDATIONS } from "../domain/assistant-tools-catalog";
import { buildAssistantSystemPrompt } from "../domain/system-prompt";
import type {
  AgenticFunctionCall,
  AgenticMessage,
  AgenticToolResultPart,
  AssistantToolRegistry,
  LlmAgenticPort,
} from "./agentic-port";
import type { AssistantThreadWriter } from "./assistant-thread-writer";

// Boucle AGENTIQUE de l'assistant (parité legacy `/api/assistant/stream` mode outils). Le modèle peut
// appeler des outils (function-calling) sur ≤ MAX_TURNS tours : à chaque tour on STREAME le texte, on
// exécute les outils demandés (registry → use-cases migrés), on réinjecte les résultats, et on
// recommence jusqu'à ce que le modèle réponde sans outil. NON routé tant que la parité agentique
// n'est pas complète (sinon régression). La boucle est PURE/testable via un `FakeLlmAgenticPort`.

// Plafond de tours (parité legacy MAX_TURNS=10) : borne dure anti-boucle infinie.
export const MAX_AGENT_TURNS = 10;
// Fenêtre d'historique réinjectée (parité legacy : 10 derniers messages).
const HISTORY_WINDOW = 10;

export interface AssistantAgentDeps {
  readonly llm: LlmAgenticPort;
  readonly registry: AssistantToolRegistry;
  readonly rateLimiter: RateLimiterPort;
  readonly artisanReader: ArtisanReader;
  readonly statsReader: ConseilsStatsReader;
  readonly threadWriter: AssistantThreadWriter;
}

export interface AssistantAgentInput {
  readonly message: string;
  readonly history?: { role: string; content: string }[];
  readonly pageContext?: string;
  readonly threadId?: number;
}

// Évènements émis vers la couche transport (SSE). Parité legacy : `{threadId}` au début, `{content}`
// par fragment de texte, `{toolCall}` à chaque exécution d'outil, `{invalidate}` après une écriture.
export type AssistantAgentEvent =
  | { readonly threadId: number }
  | { readonly content: string }
  | { readonly toolCall: { readonly name: string; readonly args: Record<string, unknown> } }
  | { readonly invalidate: readonly string[] };

// Contenu NEUTRE des messages construits par le use-case (le contenu des messages `model` ISSUS du
// port reste OPAQUE — round-trip pour préserver le thoughtSignature Gemini 3.x).
export type SeededMessageContent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "tool-results"; readonly results: readonly AgenticToolResultPart[] };

export const userMessage = (text: string): AgenticMessage => ({ role: "user", content: { kind: "text", text } satisfies SeededMessageContent });
export const modelTextMessage = (text: string): AgenticMessage => ({ role: "model", content: { kind: "text", text } satisfies SeededMessageContent });
export const toolMessage = (results: readonly AgenticToolResultPart[]): AgenticMessage => ({
  role: "tool",
  content: { kind: "tool-results", results } satisfies SeededMessageContent,
});

// Réponse d'outil renvoyée au modèle : l'enveloppe `ToolResult` complète (`{ok,data}` / `{ok,error}`),
// à parité legacy (`functionResponse.response = result`).
function toResultPart(call: AgenticFunctionCall, res: { ok: true; data: unknown } | { ok: false; error: string }): AgenticToolResultPart {
  return { id: call.id, name: call.name, response: res };
}

export async function* runAssistantAgent(
  deps: AssistantAgentDeps,
  ctx: TenantContext,
  input: AssistantAgentInput,
): AsyncGenerator<AssistantAgentEvent> {
  if (!input.message || !input.message.trim()) throw new ValidationError("Message requis");
  if (!(await deps.rateLimiter.check(`ia:${ctx.artisanId}`))) throw new TooManyRequestsError("Trop de requêtes. Réessayez dans quelques minutes.");

  const artisan = await deps.artisanReader.getArtisan(ctx);
  const metier = (artisan?.metier as string | null | undefined) || (artisan?.specialite as string | null | undefined) || null;

  // Stats best-effort (un échec ne casse pas le chat).
  let stats = { devisEnCours: 0, facturesImpayeesCount: 0, facturesImpayeesTotal: 0 };
  try {
    const s = await deps.statsReader.getStats(ctx);
    stats = { devisEnCours: s.nbDevisEnAttente, facturesImpayeesCount: s.nbFacturesImpayees, facturesImpayeesTotal: s.montantImpayees };
  } catch {
    /* best-effort */
  }

  const system = buildAssistantSystemPrompt({ artisanName: artisan?.nomEntreprise ?? null, metier, stats, pageContext: input.pageContext });

  // Thread : réutilise le threadId fourni, sinon en crée un (best-effort).
  let threadId = input.threadId ?? 0;
  if (!threadId) {
    try {
      threadId = await deps.threadWriter.createThread(ctx, input.message);
    } catch {
      threadId = 0;
    }
  }
  if (threadId) yield { threadId };

  // Historique (≤ fenêtre) puis le message courant.
  const messages: AgenticMessage[] = [];
  for (const h of (input.history ?? []).slice(-HISTORY_WINDOW)) {
    messages.push(h.role === "assistant" || h.role === "model" ? modelTextMessage(h.content) : userMessage(h.content));
  }
  messages.push(userMessage(input.message));

  let full = "";
  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const calls: AgenticFunctionCall[] = [];
    let modelMessage: AgenticMessage | null = null;

    for await (const ev of deps.llm.streamTurn({ system, tools: deps.registry.tools, messages })) {
      if (ev.kind === "text") {
        if (ev.text) {
          full += ev.text;
          yield { content: ev.text };
        }
      } else {
        // turn-complete : message `model` BRUT (à réinjecter tel quel) + outils à exécuter.
        modelMessage = ev.modelMessage;
        for (const c of ev.functionCalls) calls.push(c);
      }
    }

    if (modelMessage) messages.push(modelMessage);
    if (calls.length === 0) break; // le modèle a répondu sans outil → fin.

    // Exécution des outils + réinjection des résultats au tour suivant.
    const results: AgenticToolResultPart[] = [];
    for (const call of calls) {
      yield { toolCall: { name: call.name, args: call.args } };
      const res = await deps.registry.execute(call.name, call.args, ctx);
      results.push(toResultPart(call, res));
      if (res.ok && isWriteTool(call.name)) {
        const inv = TOOL_INVALIDATIONS[call.name];
        if (inv && inv.length) yield { invalidate: inv };
      }
    }
    messages.push(toolMessage(results));
  }

  // Persistance best-effort (n'altère pas le stream déjà émis).
  if (threadId) {
    try {
      await deps.threadWriter.addMessage(ctx, threadId, "user", input.message);
      if (full) await deps.threadWriter.addMessage(ctx, threadId, "assistant", full);
    } catch {
      /* best-effort */
    }
  }
}

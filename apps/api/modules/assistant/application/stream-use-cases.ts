import { TooManyRequestsError, ValidationError } from "../../../shared/errors";
import type { LlmPort } from "../../../shared/ports/llm";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import type { TenantContext } from "../../../shared/tenant";
import type { ConseilsStatsReader } from "../../conseils-ia/application/conseils-stats-reader";
import { buildAssistantSystemPrompt, buildUserPrompt } from "../domain/system-prompt";
import type { AssistantThreadWriter } from "./assistant-thread-writer";

/*
 * Dépendances du chat assistant en streaming (text mode, parité PARTIELLE legacy `/api/assistant/stream`
 * — le mode AGENTIQUE [outils function-calling] reste à porter). Persiste user+assistant à la fin.
 */
export interface AssistantStreamDeps {
  readonly llm: LlmPort;
  readonly rateLimiter: RateLimiterPort;
  readonly artisanReader: ArtisanReader;
  readonly statsReader: ConseilsStatsReader;
  readonly threadWriter: AssistantThreadWriter;
}

export interface AssistantStreamInput {
  readonly message: string;
  readonly history?: { role: string; content: string }[];
  readonly pageContext?: string;
  readonly threadId?: number;
}

/** Évènement SSE émis vers le client (parité legacy : `{threadId}` au début, puis `{content}` par chunk). */
export type AssistantStreamEvent = { readonly threadId: number } | { readonly content: string };

/*
 * Chat assistant en streaming : rate-limit IA (429), message requis (400), construit le prompt
 * (système métier + stats best-effort + historique), STREAME la réponse Gemini fragment par fragment,
 * persiste le message user et la réponse complète. Renvoie un AsyncIterable d'évènements SSE.
 */
export async function* streamAssistantReply(
  deps: AssistantStreamDeps,
  ctx: TenantContext,
  input: AssistantStreamInput,
): AsyncGenerator<AssistantStreamEvent> {
  if (!input.message || !input.message.trim()) throw new ValidationError("Message requis");
  if (!(await deps.rateLimiter.check(`ia:${ctx.artisanId}`))) throw new TooManyRequestsError("Trop de requêtes. Réessayez dans quelques minutes.");

  const artisan = await deps.artisanReader.getArtisan(ctx);
  const metier = (artisan?.metier as string | null | undefined) || (artisan?.specialite as string | null | undefined) || null;

  /** Stats best-effort (un échec ne casse pas le chat). */
  let stats = { devisEnCours: 0, facturesImpayeesCount: 0, facturesImpayeesTotal: 0 };
  try {
    const s = await deps.statsReader.getStats(ctx);
    stats = { devisEnCours: s.nbDevisEnAttente, facturesImpayeesCount: s.nbFacturesImpayees, facturesImpayeesTotal: s.montantImpayees };
  } catch {
    /* best-effort */
  }

  const system = buildAssistantSystemPrompt({ artisanName: artisan?.nomEntreprise ?? null, metier, stats, pageContext: input.pageContext });
  const prompt = buildUserPrompt(input.history ?? [], input.message);

  /** Thread : réutilise le threadId fourni, sinon en crée un (best-effort). */
  let threadId = input.threadId ?? 0;
  if (!threadId) {
    try {
      threadId = await deps.threadWriter.createThread(ctx, input.message);
    } catch {
      threadId = 0;
    }
  }
  if (threadId) yield { threadId };

  let full = "";
  for await (const chunk of deps.llm.stream(prompt, { system, temperature: 0.7, maxOutputTokens: 2000 })) {
    if (chunk.kind === "text") {
      full += chunk.text;
      yield { content: chunk.text };
    }
    /* chunk.kind === "done" → usage disponible ici pour le tracking (morceau suivant) */
  }

  /** Persistance best-effort (n'altère pas le stream déjà émis). */
  if (threadId) {
    try {
      await deps.threadWriter.addMessage(ctx, threadId, "user", input.message);
      if (full) await deps.threadWriter.addMessage(ctx, threadId, "assistant", full);
    } catch {
      /* best-effort */
    }
  }
}

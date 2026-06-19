import type { TenantContext } from "../../../shared/tenant";
import type { IAssistantThreadsRepository } from "./assistant-threads-repository";
import type { AssistantThreadWriter } from "./assistant-thread-writer";

export interface VoicePersistDeps {
  readonly threadsRepo: IAssistantThreadsRepository;
  readonly threadWriter: AssistantThreadWriter;
}

export interface VoicePersistInput {
  readonly threadId: number;
  readonly userTranscript?: string;
  readonly assistantTranscript?: string;
  readonly usageMetadata?: unknown;
}

export type VoicePersistOutcome =
  | { readonly kind: "bad-request" }
  | { readonly kind: "not-found" }
  | { readonly kind: "ok" };

/*
 * `voice/persist` (parité legacy) : persiste les transcripts d'une session vocale dans un thread du
 * tenant. threadId + au moins un transcript requis (sinon 400) ; thread non possédé → 404 (anti-IDOR).
 * Les messages sont marqués `{source:'voice'}` (+ usage Gemini sur la réponse assistant).
 */
export async function persistVoiceTranscript(
  deps: VoicePersistDeps,
  ctx: TenantContext,
  input: VoicePersistInput,
): Promise<VoicePersistOutcome> {
  const userText = input.userTranscript?.trim() ?? "";
  const assistantText = input.assistantTranscript?.trim() ?? "";
  if (!input.threadId || (!userText && !assistantText)) return { kind: "bad-request" };

  const thread = await deps.threadsRepo.getThreadOwned(ctx, input.threadId);
  if (!thread) return { kind: "not-found" };

  if (userText) await deps.threadWriter.addMessage(ctx, input.threadId, "user", userText, { source: "voice" });
  if (assistantText) await deps.threadWriter.addMessage(ctx, input.threadId, "assistant", assistantText, { source: "voice" }, input.usageMetadata);
  return { kind: "ok" };
}

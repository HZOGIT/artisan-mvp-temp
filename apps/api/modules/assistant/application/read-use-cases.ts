import type { TenantContext } from "../../../shared/tenant";
import type { AiThread, AiMessage } from "../domain/assistant";
import { clampThreadsLimit, clampMessagesLimit } from "../domain/assistant";
import type { IAssistantThreadsRepository } from "./assistant-threads-repository";

/** `assistant.getThreads` (parité legacy) : threads de l'assistant du tenant (20 récents). */
export function getThreads(repo: IAssistantThreadsRepository, ctx: TenantContext): Promise<AiThread[]> {
  return repo.listThreads(ctx, clampThreadsLimit());
}

/*
 * `assistant.getMessages` (parité legacy) : messages d'un thread, **après vérif d'appartenance** au
 * tenant. Thread inexistant / d'un autre tenant → `[]` (parité legacy : pas d'erreur, anti-IDOR via
 * le thread parent ; `ai_messages` n'a pas d'artisanId).
 */
export async function getMessages(
  repo: IAssistantThreadsRepository,
  ctx: TenantContext,
  threadId: number,
): Promise<AiMessage[]> {
  const thread = await repo.getThreadOwned(ctx, threadId);
  if (!thread) return [];
  return repo.listMessages(ctx, threadId, clampMessagesLimit());
}

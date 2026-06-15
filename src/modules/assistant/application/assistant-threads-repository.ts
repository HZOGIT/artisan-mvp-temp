import type { TenantContext } from "../../../shared/tenant";
import type { AiThread, AiMessage } from "../domain/assistant";

// Lecture des threads/messages de l'assistant IA, scopée tenant. `ai_threads` filtré par artisanId
// (RLS) ; `ai_messages` (sans artisanId) lu UNIQUEMENT après vérif d'appartenance du thread parent.
export interface IAssistantThreadsRepository {
  // Threads du tenant, triés lastMessageAt desc, bornés (clamp côté use-case).
  listThreads(ctx: TenantContext, limit: number): Promise<AiThread[]>;
  // Thread possédé par le tenant, ou null (anti-IDOR pour la lecture des messages).
  getThreadOwned(ctx: TenantContext, threadId: number): Promise<AiThread | null>;
  // Messages d'un thread, triés createdAt asc, bornés. L'appelant DOIT avoir prouvé l'ownership.
  listMessages(ctx: TenantContext, threadId: number, limit: number): Promise<AiMessage[]>;
}

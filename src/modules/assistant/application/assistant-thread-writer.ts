import type { TenantContext } from "../../../shared/tenant";

// Persistance des threads/messages de l'assistant (création d'un thread, ajout d'un message). Scopée
// tenant : le thread porte `artisanId` (RLS) ; `ai_messages` (sans artisanId) est scopé via le thread.
export interface AssistantThreadWriter {
  // Crée un nouveau thread à partir du 1er message (titre = 80 premiers caractères). Renvoie son id.
  createThread(ctx: TenantContext, firstMessage: string): Promise<number>;
  // Ajoute un message au thread (user/assistant) + rafraîchit `lastMessageAt` (si le thread est du
  // tenant). `metadata`/`pricingMetadata` optionnels (ex. `{source:'voice'}` + usage Gemini).
  addMessage(
    ctx: TenantContext,
    threadId: number,
    role: "user" | "assistant",
    transcript: string,
    metadata?: unknown,
    pricingMetadata?: unknown,
  ): Promise<void>;
}

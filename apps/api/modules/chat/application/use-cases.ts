import { ForbiddenError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { Conversation, ConversationWithClient, Message } from "../domain/chat";
import type { IChatRepository, ChatClientNotifier } from "./chat-repository";

export interface ChatDeps {
  readonly repo: IChatRepository;
  readonly notifier: ChatClientNotifier;
}

/** `chat.getConversations` (parité legacy) : conversations du tenant enrichies du client. */
export function getConversations(deps: ChatDeps, ctx: TenantContext): Promise<ConversationWithClient[]> {
  return deps.repo.listConversations(ctx);
}

/** Vérifie l'appartenance d'une conversation au tenant, sinon **FORBIDDEN** (parité legacy). */
async function assertConversationOwned(deps: ChatDeps, ctx: TenantContext, conversationId: number): Promise<Conversation> {
  const conv = await deps.repo.getConversationOwned(ctx, conversationId);
  if (!conv) throw new ForbiddenError("Conversation non accessible");
  return conv;
}

/** `chat.getMessages` (parité legacy) : ownership → marque lus (côté artisan) → messages. */
export async function getMessages(deps: ChatDeps, ctx: TenantContext, conversationId: number): Promise<Message[]> {
  await assertConversationOwned(deps, ctx, conversationId);
  await deps.repo.markMessagesAsRead(ctx, conversationId, "artisan");
  return deps.repo.listMessages(ctx, conversationId);
}

/*
 * `chat.sendMessage` (parité legacy) : ownership → crée le message (auteur artisan) → notifie le
 * client (email best-effort, jamais bloquant). Renvoie le message créé.
 */
export async function sendMessage(
  deps: ChatDeps,
  ctx: TenantContext,
  input: { conversationId: number; contenu: string },
): Promise<Message> {
  const conv = await assertConversationOwned(deps, ctx, input.conversationId);
  const msg = await deps.repo.createMessage(ctx, { conversationId: input.conversationId, auteur: "artisan", contenu: input.contenu });
  try {
    await deps.notifier.notifyNewMessage(ctx, conv, input.contenu);
  } catch {
    /* best-effort : la notification email ne casse jamais l'envoi du message in-app */
  }
  return msg;
}

/*
 * `chat.startConversation` (parité legacy) : ownership du client → conversation (réutilisée si ouverte)
 * + 1er message optionnel.
 */
export async function startConversation(
  deps: ChatDeps,
  ctx: TenantContext,
  input: { clientId: number; sujet?: string; premierMessage?: string },
): Promise<Conversation> {
  if (!(await deps.repo.clientOwned(ctx, input.clientId))) throw new ForbiddenError("Client non accessible");
  const conv = await deps.repo.getOrCreateConversation(ctx, input.clientId, input.sujet);
  if (input.premierMessage) {
    await deps.repo.createMessage(ctx, { conversationId: conv.id, auteur: "artisan", contenu: input.premierMessage });
  }
  return conv;
}

/** `chat.getUnreadCount` (parité legacy) : somme des non-lus artisan (hors archivées). */
export function getUnreadCount(deps: ChatDeps, ctx: TenantContext): Promise<number> {
  return deps.repo.getUnreadCount(ctx);
}

/** `chat.archive/close/reopen` (parité legacy) : ownership → changement de statut. */
export async function archiveConversation(deps: ChatDeps, ctx: TenantContext, conversationId: number): Promise<Conversation> {
  await assertConversationOwned(deps, ctx, conversationId);
  return deps.repo.updateStatut(ctx, conversationId, "archivee");
}
export async function closeConversation(deps: ChatDeps, ctx: TenantContext, conversationId: number): Promise<Conversation> {
  await assertConversationOwned(deps, ctx, conversationId);
  return deps.repo.updateStatut(ctx, conversationId, "fermee");
}
export async function reopenConversation(deps: ChatDeps, ctx: TenantContext, conversationId: number): Promise<Conversation> {
  await assertConversationOwned(deps, ctx, conversationId);
  return deps.repo.updateStatut(ctx, conversationId, "ouverte");
}

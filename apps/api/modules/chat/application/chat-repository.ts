import type { TenantContext } from "../../../shared/tenant";
import type { Conversation, ConversationWithClient, Message, MessageAuteur, ConversationStatut } from "../domain/chat";

/*
 * Accès aux conversations/messages support, scopé tenant (`conversations` RLS + filtre artisanId ;
 * `messages` sans artisanId → l'appelant prouve l'ownership de la conversation parente).
 */
export interface IChatRepository {
  /** Conversations du tenant (enrichies du client), triées dernierMessageDate desc puis updatedAt desc. */
  listConversations(ctx: TenantContext): Promise<ConversationWithClient[]>;
  /** Conversation possédée par le tenant, ou null (anti-IDOR). */
  getConversationOwned(ctx: TenantContext, conversationId: number): Promise<Conversation | null>;
  /** Le client appartient-il au tenant ? (ownership pour startConversation). */
  clientOwned(ctx: TenantContext, clientId: number): Promise<boolean>;
  /** Messages d'une conversation, triés createdAt asc (l'appelant a prouvé l'ownership). */
  listMessages(ctx: TenantContext, conversationId: number): Promise<Message[]>;
  /** Marque lus les messages de l'autre partie + remet à 0 le compteur du lecteur. */
  markMessagesAsRead(ctx: TenantContext, conversationId: number, lecteur: MessageAuteur): Promise<void>;
  /** Crée un message + met à jour la conversation (dernierMessage/date + incrément du non-lu de l'autre). */
  createMessage(ctx: TenantContext, input: { conversationId: number; auteur: MessageAuteur; contenu: string }): Promise<Message>;
  /** Conversation OUVERTE existante (même client, sans sujet imposé) ou nouvelle. */
  getOrCreateConversation(ctx: TenantContext, clientId: number, sujet?: string): Promise<Conversation>;
  /** Change le statut d'une conversation possédée (archive/ferme/rouvre). */
  updateStatut(ctx: TenantContext, conversationId: number, statut: ConversationStatut): Promise<Conversation>;
  /** Somme des non-lus artisan sur les conversations non archivées. */
  getUnreadCount(ctx: TenantContext): Promise<number>;
}

/*
 * Notification best-effort au client lors d'un nouveau message artisan (email + lien portail). Séparée
 * du repo (effet de bord). Impl Drizzle/email branchée au câblage ; jamais bloquante.
 */
export interface ChatClientNotifier {
  notifyNewMessage(ctx: TenantContext, conversation: Conversation, contenu: string): Promise<void>;
}

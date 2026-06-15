// Domaine CHAT (messagerie SUPPORT artisan↔client, in-app + notification email). Request/response,
// PAS de SSE (≠ assistant IA). `conversations`/`messages` (≠ `ai_threads`/`ai_messages`).
// `conversations` porte artisanId (RLS) ; `messages` n'en a pas → scopé via la conversation parente
// (anti-IDOR). Parité legacy `chatRouter`.

export type ConversationStatut = "ouverte" | "fermee" | "archivee";
export type MessageAuteur = "artisan" | "client";

export interface Conversation {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly sujet: string | null;
  readonly statut: ConversationStatut;
  readonly dernierMessage: string | null;
  readonly dernierMessageDate: Date | null;
  readonly nonLuArtisan: number;
  readonly nonLuClient: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Client minimal joint à la conversation (la vue artisan affiche le nom/email du client).
export interface ChatClient {
  readonly id: number;
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
}

export interface ConversationWithClient extends Conversation {
  readonly client: ChatClient | null;
}

export interface Message {
  readonly id: number;
  readonly conversationId: number;
  readonly auteur: MessageAuteur;
  readonly contenu: string;
  readonly lu: boolean;
  readonly pieceJointe: string | null;
  readonly pieceJointeUrl: string | null;
  readonly createdAt: Date;
}

// Aperçu du dernier message stocké sur la conversation (parité legacy : 100 premiers caractères).
export function apercu(contenu: string): string {
  return contenu.substring(0, 100);
}

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

// Échappement HTML minimal (parité legacy `safeHtml`) avant injection dans l'email de notification.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Email « nouveau message » envoyé au client (gabarit fidèle au legacy `chatRouter.sendMessage`).
// `contenu` tronqué à 300 caractères (+ « … » au-delà). `portalLink` = lien portail si disponible.
export function buildNewMessageEmail(input: {
  clientName: string;
  artisanName: string;
  contenu: string;
  portalLink: string | null;
}): { subject: string; body: string } {
  const artisanName = input.artisanName || "votre artisan";
  const apercuContenu = `${escapeHtml(input.contenu.substring(0, 300))}${input.contenu.length > 300 ? "..." : ""}`;
  const cta = input.portalLink
    ? `<p><a href="${input.portalLink}" style="background:#2980b9;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;display:inline-block">Répondre sur le portail</a></p>`
    : "";
  return {
    subject: `Nouveau message de ${artisanName}`,
    body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <h2 style="color:#2980b9">Nouveau message</h2>
              <p>Bonjour ${escapeHtml(input.clientName)},</p>
              <p><strong>${escapeHtml(artisanName)}</strong> vous a envoyé un message :</p>
              <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #2980b9">
                <p style="margin:0">${apercuContenu}</p>
              </div>
              ${cta}
              <p style="color:#999;font-size:12px">Cet email a été envoyé automatiquement.</p>
            </div>`,
  };
}

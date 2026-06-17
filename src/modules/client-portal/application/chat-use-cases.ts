import { ForbiddenError, NotFoundError, TooManyRequestsError, UnauthorizedError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IPortalAccessRepository } from "./portal-access-repository";

// Sous-ensemble du port chat migré requis (typage structurel → on passe directement IChatRepository).
export interface PortalChatConversation {
  readonly id: number;
  readonly clientId: number;
  readonly artisanId: number;
}
export interface PortalChatMessage {
  readonly id: number;
  readonly conversationId: number;
  readonly auteur: string;
  readonly contenu: string;
  // OPE-403 : exposé pour l'UI portail (`createdAt` du message ; déjà présent au runtime, type élargi).
  readonly createdAt: Date;
}
// Vue « liste » d'une conversation côté portail (sujet + aperçu + non-lus) — déjà fourni par le repo
// chat migré (ConversationWithClient), type ici élargi pour que l'UI portail le consomme (OPE-403).
export interface PortalChatConversationSummary {
  readonly id: number;
  readonly clientId: number;
  readonly sujet: string | null;
  readonly nonLuClient: number;
  readonly dernierMessage: string | null;
  readonly dernierMessageDate: Date | null;
}
export interface ChatRepoForPortal {
  listConversations(ctx: TenantContext): Promise<PortalChatConversationSummary[]>;
  getConversationOwned(ctx: TenantContext, conversationId: number): Promise<PortalChatConversation | null>;
  listMessages(ctx: TenantContext, conversationId: number): Promise<PortalChatMessage[]>;
  markMessagesAsRead(ctx: TenantContext, conversationId: number, lecteur: "client" | "artisan"): Promise<void>;
  createMessage(ctx: TenantContext, input: { conversationId: number; auteur: "client" | "artisan"; contenu: string }): Promise<PortalChatMessage>;
}

export interface PortalChatDeps {
  readonly access: Pick<IPortalAccessRepository, "resolveByToken">;
  readonly chat: ChatRepoForPortal;
  readonly clients: { getById(ctx: TenantContext, id: number): Promise<{ nom: string; prenom: string | null } | null> };
  readonly notifications: { creer(ctx: TenantContext, input: { type: "info"; titre: string; message: string; lien: string }): Promise<unknown> };
  readonly rateLimiter: { check(key: string): Promise<boolean> };
}

async function resolve(deps: { access: Pick<IPortalAccessRepository, "resolveByToken"> }, token: string, now: Date): Promise<{ ctx: TenantContext; clientId: number; artisanId: number }> {
  const access = await deps.access.resolveByToken(token, now);
  if (!access) throw new UnauthorizedError("Accès non autorisé");
  return { ctx: { artisanId: access.artisanId, userId: 0 }, clientId: access.clientId, artisanId: access.artisanId };
}

// Conversation possédée par le tenant ET appartenant au client du token (double anti-IDOR : ownership
// tenant via le repo + appariement clientId du token). FORBIDDEN sinon.
async function conversationDuClient(deps: PortalChatDeps, ctx: TenantContext, clientId: number, conversationId: number): Promise<PortalChatConversation> {
  const conv = await deps.chat.getConversationOwned(ctx, conversationId);
  if (!conv || conv.clientId !== clientId || conv.artisanId !== ctx.artisanId) throw new ForbiddenError("Accès non autorisé");
  return conv;
}

// Conversations du client connecté (filtrées sur SON clientId parmi celles du tenant).
export async function getConversations(deps: Pick<PortalChatDeps, "access" | "chat">, token: string, now: Date = new Date()): Promise<PortalChatConversationSummary[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  const all = await deps.chat.listConversations(ctx);
  return all.filter((c) => c.clientId === clientId);
}

// Messages d'une conversation du client (marque comme lus côté client). FORBIDDEN si la conv n'est pas la sienne.
export async function getConversationMessages(deps: PortalChatDeps, token: string, conversationId: number, now: Date = new Date()): Promise<PortalChatMessage[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  await conversationDuClient(deps, ctx, clientId, conversationId);
  await deps.chat.markMessagesAsRead(ctx, conversationId, "client");
  return deps.chat.listMessages(ctx, conversationId);
}

// Envoi d'un message client (anti-flood) → notifie l'artisan.
export async function sendClientMessage(deps: PortalChatDeps, token: string, conversationId: number, contenu: string, now: Date = new Date()): Promise<PortalChatMessage> {
  const { ctx, clientId, artisanId } = await resolve(deps, token, now);
  if (!(await deps.rateLimiter.check(`portal-chat:${artisanId}:${clientId}`))) {
    throw new TooManyRequestsError("Trop de messages envoyés. Réessayez dans quelques minutes.");
  }
  await conversationDuClient(deps, ctx, clientId, conversationId);
  const msg = await deps.chat.createMessage(ctx, { conversationId, auteur: "client", contenu });
  try {
    const client = await deps.clients.getById(ctx, clientId);
    const clientName = client ? `${client.prenom || ""} ${client.nom || ""}`.trim() || "Un client" : "Un client";
    await deps.notifications.creer(ctx, { type: "info", titre: `Nouveau message de ${clientName}`, message: contenu.substring(0, 200), lien: "/chat" });
  } catch {
    /* best-effort */
  }
  return msg;
}

// Marque les messages d'une conversation du client comme lus (anti-IDOR : appartenance vérifiée).
export async function markClientMessagesAsRead(deps: PortalChatDeps, token: string, conversationId: number, now: Date = new Date()): Promise<{ success: true }> {
  const { ctx, clientId } = await resolve(deps, token, now);
  await conversationDuClient(deps, ctx, clientId, conversationId);
  await deps.chat.markMessagesAsRead(ctx, conversationId, "client");
  return { success: true };
}

// ── demanderModification (public) ─────────────────────────────────────────────
export interface DemanderModificationDeps {
  readonly access: Pick<IPortalAccessRepository, "resolveByToken">;
  readonly artisanReader: { getArtisanPublic(artisanId: number): Promise<{ email: string | null } | null> };
  readonly clients: { getById(ctx: TenantContext, id: number): Promise<{ nom: string; prenom: string | null; email: string | null } | null> };
  readonly email: { send(message: { to: string; subject: string; body: string }): Promise<void> };
  readonly rateLimiter: { check(key: string): Promise<boolean> };
}

function safeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Le client demande une modification de ses infos → email à l'artisan (anti-flood). 404 si artisan
// sans email ou client introuvable (parité legacy).
export async function demanderModification(deps: DemanderModificationDeps, token: string, message: string, now: Date = new Date()): Promise<{ success: true }> {
  const { ctx, clientId, artisanId } = await resolve(deps, token, now);
  if (!(await deps.rateLimiter.check(`portal-modif:${artisanId}:${clientId}`))) {
    throw new TooManyRequestsError("Trop de demandes. Réessayez dans quelques minutes.");
  }
  const [client, artisan] = await Promise.all([deps.clients.getById(ctx, clientId), deps.artisanReader.getArtisanPublic(artisanId)]);
  if (!client || !artisan?.email) throw new NotFoundError("Données introuvables");
  const clientName = `${client.prenom || ""} ${client.nom}`.trim();
  await deps.email.send({
    to: artisan.email,
    subject: `Demande de modification — ${clientName}`,
    body: `<p>Le client <strong>${safeHtml(clientName)}</strong> (${safeHtml(client.email || "pas d'email")}) demande une modification de ses informations via le portail client :</p><blockquote style="border-left:3px solid #2563eb;padding:12px;margin:16px 0;background:#f8fafc;">${safeHtml(message)}</blockquote>`,
  });
  return { success: true };
}

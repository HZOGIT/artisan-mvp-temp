import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { conversations, messages, clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { Conversation, ConversationWithClient, Message, MessageAuteur, ConversationStatut } from "../domain/chat";
import { apercu } from "../domain/chat";
import type { IChatRepository } from "../application/chat-repository";

function toConversation(r: typeof conversations.$inferSelect): Conversation {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    sujet: r.sujet ?? null,
    statut: (r.statut ?? "ouverte") as ConversationStatut,
    dernierMessage: r.dernierMessage ?? null,
    dernierMessageDate: r.dernierMessageDate ?? null,
    nonLuArtisan: r.nonLuArtisan ?? 0,
    nonLuClient: r.nonLuClient ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toMessage(r: typeof messages.$inferSelect): Message {
  return {
    id: r.id,
    conversationId: r.conversationId,
    auteur: r.auteur as MessageAuteur,
    contenu: r.contenu,
    lu: r.lu ?? false,
    pieceJointe: r.pieceJointe ?? null,
    pieceJointeUrl: r.pieceJointeUrl ?? null,
    createdAt: r.createdAt,
  };
}

// Repo chat sous RLS (withTenant) + filtre artisanId. `messages` (sans artisanId) n'est touché
// qu'après preuve d'ownership de la conversation (côté use-case). Reproduit fidèlement les effets
// legacy (compteurs non-lus, aperçu du dernier message, getOrCreate conversation ouverte).
export class ChatRepositoryDrizzle implements IChatRepository {
  constructor(private readonly db: DbClient) {}

  listConversations(ctx: TenantContext): Promise<ConversationWithClient[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({
          conv: conversations,
          clientId: clients.id,
          nom: clients.nom,
          prenom: clients.prenom,
          email: clients.email,
        })
        .from(conversations)
        .leftJoin(clients, and(eq(clients.id, conversations.clientId), eq(clients.artisanId, ctx.artisanId)))
        .where(eq(conversations.artisanId, ctx.artisanId))
        .orderBy(desc(conversations.dernierMessageDate), desc(conversations.updatedAt));
      return rows.map((r) => ({
        ...toConversation(r.conv),
        client: r.clientId != null ? { id: r.clientId, nom: r.nom ?? "", prenom: r.prenom ?? null, email: r.email ?? null } : null,
      }));
    });
  }

  getConversationOwned(ctx: TenantContext, conversationId: number): Promise<Conversation | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.artisanId, ctx.artisanId))).limit(1);
      return r ? toConversation(r) : null;
    });
  }

  clientOwned(ctx: TenantContext, clientId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId))).limit(1);
      return !!r;
    });
  }

  listMessages(ctx: TenantContext, conversationId: number): Promise<Message[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
      return rows.map(toMessage);
    });
  }

  markMessagesAsRead(ctx: TenantContext, conversationId: number, lecteur: MessageAuteur): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      const auteurDesMessages: MessageAuteur = lecteur === "artisan" ? "client" : "artisan";
      await tx
        .update(messages)
        .set({ lu: true })
        .where(and(eq(messages.conversationId, conversationId), eq(messages.auteur, auteurDesMessages), eq(messages.lu, false)));
      const reset = lecteur === "artisan" ? { nonLuArtisan: 0 } : { nonLuClient: 0 };
      await tx.update(conversations).set(reset).where(eq(conversations.id, conversationId));
    });
  }

  createMessage(ctx: TenantContext, input: { conversationId: number; auteur: MessageAuteur; contenu: string }): Promise<Message> {
    return withTenant(this.db, ctx, async (tx) => {
      const [inserted] = await tx.insert(messages).values({ conversationId: input.conversationId, auteur: input.auteur, contenu: input.contenu }).returning();
      const maj = { dernierMessage: apercu(input.contenu), dernierMessageDate: new Date(), updatedAt: new Date() };
      const compteur = input.auteur === "artisan"
        ? { nonLuClient: sql`${conversations.nonLuClient} + 1` }
        : { nonLuArtisan: sql`${conversations.nonLuArtisan} + 1` };
      await tx.update(conversations).set({ ...maj, ...compteur }).where(eq(conversations.id, input.conversationId));
      return toMessage(inserted);
    });
  }

  getOrCreateConversation(ctx: TenantContext, clientId: number, sujet?: string): Promise<Conversation> {
    return withTenant(this.db, ctx, async (tx) => {
      const [existing] = await tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.artisanId, ctx.artisanId), eq(conversations.clientId, clientId), eq(conversations.statut, "ouverte")))
        .orderBy(desc(conversations.updatedAt))
        .limit(1);
      if (existing && !sujet) return toConversation(existing);
      const [created] = await tx.insert(conversations).values({ artisanId: ctx.artisanId, clientId, sujet: sujet ?? null, statut: "ouverte" }).returning();
      return toConversation(created);
    });
  }

  updateStatut(ctx: TenantContext, conversationId: number, statut: ConversationStatut): Promise<Conversation> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx.update(conversations).set({ statut, updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.artisanId, ctx.artisanId)));
      const [r] = await tx.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
      return toConversation(r);
    });
  }

  getUnreadCount(ctx: TenantContext): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx
        .select({ total: sql<number>`coalesce(sum(${conversations.nonLuArtisan}), 0)::int` })
        .from(conversations)
        .where(and(eq(conversations.artisanId, ctx.artisanId), ne(conversations.statut, "archivee")));
      return r?.total ?? 0;
    });
  }
}

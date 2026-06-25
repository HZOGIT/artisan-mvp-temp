import type { TenantContext } from "../../../shared/tenant";
import type { Conversation, ConversationWithClient, Message, MessageAuteur, ConversationStatut } from "../domain/chat";
import { apercu } from "../domain/chat";
import type { IChatRepository, ChatClientNotifier } from "../application/chat-repository";

/** Repo chat in-memory pour les tests (scoping tenant + effets legacy reproduits). */
export class FakeChatRepository implements IChatRepository {
  private convs: Conversation[] = [];
  private msgs: Message[] = [];
  /** `${artisanId}:${clientId}` */
  private ownedClients = new Set<string>();
  private convSeq = 1;
  private msgSeq = 1;

  seedConversation(c: Partial<Conversation> & { id: number; artisanId: number; clientId: number }): void {
    this.convs.push({ sujet: null, statut: "ouverte", dernierMessage: null, dernierMessageDate: null, nonLuArtisan: 0, nonLuClient: 0, createdAt: new Date(), updatedAt: new Date(), ...c });
    this.convSeq = Math.max(this.convSeq, c.id + 1);
  }
  seedMessage(m: Message): void {
    this.msgs.push(m);
  }
  seedClient(artisanId: number, clientId: number): void {
    this.ownedClients.add(`${artisanId}:${clientId}`);
  }

  private owned(ctx: TenantContext, id: number): Conversation | undefined {
    return this.convs.find((c) => c.id === id && c.artisanId === ctx.artisanId);
  }

  async listConversations(ctx: TenantContext): Promise<ConversationWithClient[]> {
    return this.convs
      .filter((c) => c.artisanId === ctx.artisanId)
      .sort((a, b) => (b.dernierMessageDate?.getTime() ?? 0) - (a.dernierMessageDate?.getTime() ?? 0))
      .map((c) => ({ ...c, client: null }));
  }
  async getConversationOwned(ctx: TenantContext, conversationId: number): Promise<Conversation | null> {
    return this.owned(ctx, conversationId) ?? null;
  }
  async clientOwned(ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.ownedClients.has(`${ctx.artisanId}:${clientId}`);
  }
  async listMessages(_ctx: TenantContext, conversationId: number): Promise<Message[]> {
    return this.msgs.filter((m) => m.conversationId === conversationId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async markMessagesAsRead(_ctx: TenantContext, conversationId: number, lecteur: MessageAuteur): Promise<void> {
    const other: MessageAuteur = lecteur === "artisan" ? "client" : "artisan";
    this.msgs = this.msgs.map((m) => (m.conversationId === conversationId && m.auteur === other ? { ...m, lu: true } : m));
    const conv = this.convs.find((c) => c.id === conversationId);
    if (conv) {
      const idx = this.convs.indexOf(conv);
      this.convs[idx] = { ...conv, ...(lecteur === "artisan" ? { nonLuArtisan: 0 } : { nonLuClient: 0 }) };
    }
  }
  async createMessage(_ctx: TenantContext, input: { conversationId: number; auteur: MessageAuteur; contenu: string }): Promise<Message> {
    const msg: Message = { id: this.msgSeq++, conversationId: input.conversationId, auteur: input.auteur, contenu: input.contenu, lu: false, pieceJointe: null, pieceJointeUrl: null, createdAt: new Date() };
    this.msgs.push(msg);
    const conv = this.convs.find((c) => c.id === input.conversationId);
    if (conv) {
      const idx = this.convs.indexOf(conv);
      const inc = input.auteur === "artisan" ? { nonLuClient: conv.nonLuClient + 1 } : { nonLuArtisan: conv.nonLuArtisan + 1 };
      this.convs[idx] = { ...conv, dernierMessage: apercu(input.contenu), dernierMessageDate: new Date(), updatedAt: new Date(), ...inc };
    }
    return msg;
  }
  async getOrCreateConversation(ctx: TenantContext, clientId: number, sujet?: string): Promise<Conversation> {
    const existing = this.convs.find((c) => c.artisanId === ctx.artisanId && c.clientId === clientId && c.statut === "ouverte");
    if (existing && !sujet) return existing;
    const conv: Conversation = { id: this.convSeq++, artisanId: ctx.artisanId, clientId, sujet: sujet ?? null, statut: "ouverte", dernierMessage: null, dernierMessageDate: null, nonLuArtisan: 0, nonLuClient: 0, createdAt: new Date(), updatedAt: new Date() };
    this.convs.push(conv);
    return conv;
  }
  async updateStatut(ctx: TenantContext, conversationId: number, statut: ConversationStatut): Promise<Conversation> {
    const conv = this.owned(ctx, conversationId);
    if (!conv) throw new Error("Conversation not found");

    const idx = this.convs.indexOf(conv);
    this.convs[idx] = { ...conv, statut, updatedAt: new Date() };
    return this.convs[idx];
  }
  async getUnreadCount(ctx: TenantContext): Promise<number> {
    return this.convs.filter((c) => c.artisanId === ctx.artisanId && c.statut !== "archivee").reduce((s, c) => s + c.nonLuArtisan, 0);
  }
}

/** Notifier fake : collecte les notifications émises (assertions). Et un no-op (câblage sans email). */
export class FakeChatNotifier implements ChatClientNotifier {
  public emitted: Array<{ conversationId: number; contenu: string }> = [];
  async notifyNewMessage(_ctx: TenantContext, conversation: Conversation, contenu: string): Promise<void> {
    this.emitted.push({ conversationId: conversation.id, contenu });
  }
}

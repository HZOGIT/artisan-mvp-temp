import { describe, it, expect } from "vitest";
import { ForbiddenError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { FakeChatRepository, FakeChatNotifier } from "../infra/chat-repository-fake";
import {
  getConversations,
  getMessages,
  sendMessage,
  startConversation,
  getUnreadCount,
  archiveConversation,
  closeConversation,
  reopenConversation,
} from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

function build() {
  const repo = new FakeChatRepository();
  const notifier = new FakeChatNotifier();
  return { repo, notifier, deps: { repo, notifier } };
}

describe("chat use-cases", () => {
  it("getConversations : scopé tenant", async () => {
    const { repo, deps } = build();
    repo.seedConversation({ id: 1, artisanId: 1, clientId: 10, dernierMessageDate: new Date("2026-06-15T10:00:00Z") });
    repo.seedConversation({ id: 2, artisanId: 2, clientId: 20 });
    expect((await getConversations(deps, ctx(1))).map((c) => c.id)).toEqual([1]);
    expect(await getConversations(deps, ctx(2))).toHaveLength(1);
  });

  it("getMessages : conversation d'un autre tenant → ForbiddenError", async () => {
    const { repo, deps } = build();
    repo.seedConversation({ id: 1, artisanId: 1, clientId: 10 });
    await expect(getMessages(deps, ctx(2), 1)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("getMessages : ownership OK → marque lus + renvoie messages triés", async () => {
    const { repo, deps } = build();
    repo.seedConversation({ id: 1, artisanId: 1, clientId: 10, nonLuArtisan: 3 });
    repo.seedMessage({ id: 1, conversationId: 1, auteur: "client", contenu: "a", lu: false, pieceJointe: null, pieceJointeUrl: null, createdAt: new Date("2026-06-15T10:00:00Z") });
    const out = await getMessages(deps, ctx(1), 1);
    expect(out).toHaveLength(1);
    expect(out[0].lu).toBe(true); // marqué lu
    expect(await getUnreadCount(deps, ctx(1))).toBe(0); // compteur remis à 0
  });

  it("sendMessage : conversation d'un autre tenant → ForbiddenError (pas de message créé)", async () => {
    const { repo, deps, notifier } = build();
    repo.seedConversation({ id: 1, artisanId: 1, clientId: 10 });
    await expect(sendMessage(deps, ctx(2), { conversationId: 1, contenu: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(notifier.emitted).toHaveLength(0);
  });

  it("sendMessage : crée le message (auteur artisan) + notifie le client", async () => {
    const { repo, deps, notifier } = build();
    repo.seedConversation({ id: 1, artisanId: 1, clientId: 10 });
    const msg = await sendMessage(deps, ctx(1), { conversationId: 1, contenu: "Bonjour" });
    expect(msg.auteur).toBe("artisan");
    expect(msg.contenu).toBe("Bonjour");
    expect(notifier.emitted).toEqual([{ conversationId: 1, contenu: "Bonjour" }]);
    expect(await getUnreadCount(deps, ctx(1))).toBe(0); // incrément côté client, pas artisan
  });

  it("sendMessage : notification best-effort (échec email n'empêche pas le message)", async () => {
    const repo = new FakeChatRepository();
    repo.seedConversation({ id: 1, artisanId: 1, clientId: 10 });
    const notifier = { notifyNewMessage: async () => { throw new Error("smtp down"); } };
    const msg = await sendMessage({ repo, notifier }, ctx(1), { conversationId: 1, contenu: "X" });
    expect(msg.id).toBeGreaterThan(0);
  });

  it("startConversation : client d'un autre tenant → ForbiddenError", async () => {
    const { repo, deps } = build();
    repo.seedClient(1, 10);
    await expect(startConversation(deps, ctx(2), { clientId: 10 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("startConversation : crée la conversation + 1er message optionnel", async () => {
    const { repo, deps } = build();
    repo.seedClient(1, 10);
    const conv = await startConversation(deps, ctx(1), { clientId: 10, premierMessage: "Salut" });
    expect(conv.clientId).toBe(10);
    const msgs = await getMessages(deps, ctx(1), conv.id);
    expect(msgs.map((m) => m.contenu)).toEqual(["Salut"]);
  });

  it("startConversation : réutilise la conversation ouverte existante (sans sujet)", async () => {
    const { repo, deps } = build();
    repo.seedClient(1, 10);
    const c1 = await startConversation(deps, ctx(1), { clientId: 10 });
    const c2 = await startConversation(deps, ctx(1), { clientId: 10 });
    expect(c2.id).toBe(c1.id);
  });

  it("archive/close/reopen : changent le statut (ownership requis)", async () => {
    const { repo, deps } = build();
    repo.seedConversation({ id: 1, artisanId: 1, clientId: 10 });
    expect((await archiveConversation(deps, ctx(1), 1)).statut).toBe("archivee");
    expect((await closeConversation(deps, ctx(1), 1)).statut).toBe("fermee");
    expect((await reopenConversation(deps, ctx(1), 1)).statut).toBe("ouverte");
    await expect(archiveConversation(deps, ctx(2), 1)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

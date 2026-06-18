import { describe, it, expect } from "vitest";
import { ForbiddenError, NotFoundError, TooManyRequestsError, UnauthorizedError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { PortalAccessRepositoryFake } from "../infra/portal-access-repository-fake";
import { getConversations, getConversationMessages, sendClientMessage, markClientMessagesAsRead, demanderModification, type PortalChatDeps, type DemanderModificationDeps, type ChatRepoForPortal } from "./chat-use-cases";

const NOW = new Date("2026-06-15T10:00:00Z");
const access = () => new PortalAccessRepositoryFake({ accesses: [{ id: 1, clientId: 5, artisanId: 1, token: "good", email: "x", expiresAt: new Date("2026-12-31"), isActive: true, lastAccessAt: null, createdAt: NOW }] });

function chatRepo(): ChatRepoForPortal & { messages: any[]; reads: any[] } {
  const messages: any[] = [];
  const reads: any[] = [];
  return {
    messages,
    reads,
    // conv 10 → client 5 (la sienne) ; conv 20 → client 6 (autre client)
    listConversations: async () => [{ id: 10, clientId: 5 }, { id: 20, clientId: 6 }],
    getConversationOwned: async (_c, id) => (id === 10 ? { id: 10, clientId: 5, artisanId: 1 } : id === 20 ? { id: 20, clientId: 6, artisanId: 1 } : null),
    listMessages: async (_c, convId) => [{ id: 1, conversationId: convId, auteur: "artisan", contenu: "Bonjour" }],
    markMessagesAsRead: async (_c, convId, lecteur) => { reads.push({ convId, lecteur }); },
    createMessage: async (_c, input) => { const m = { id: 99, ...input }; messages.push(m); return m; },
  };
}

function chatDeps(over: Partial<PortalChatDeps> = {}): { deps: PortalChatDeps; notifs: any[]; repo: ReturnType<typeof chatRepo> } {
  const notifs: any[] = [];
  const repo = chatRepo();
  const deps: PortalChatDeps = {
    access: access(),
    chat: repo,
    clients: { getById: async () => ({ nom: "Dupont", prenom: "Jean" }) },
    notifications: { creer: async (_c, i) => { notifs.push(i); return {}; } },
    rateLimiter: { check: async () => true },
    ...over,
  };
  return { deps, notifs, repo };
}

describe("getConversations", () => {
  it("ne renvoie que les conversations du client du token", async () => {
    const { deps } = chatDeps();
    expect((await getConversations(deps, "good", NOW)).map((c) => c.id)).toEqual([10]);
  });
  it("token invalide → Unauthorized", async () => {
    const { deps } = chatDeps();
    await expect(getConversations(deps, "bad", NOW)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("getConversationMessages", () => {
  it("conversation du client → messages + marque lus côté client", async () => {
    const { deps, repo } = chatDeps();
    const msgs = await getConversationMessages(deps, "good", 10, NOW);
    expect(msgs).toHaveLength(1);
    expect(repo.reads).toEqual([{ convId: 10, lecteur: "client" }]);
  });
  it("conversation d'un AUTRE client → Forbidden (anti-IDOR)", async () => {
    const { deps } = chatDeps();
    await expect(getConversationMessages(deps, "good", 20, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("sendClientMessage", () => {
  it("succès → message client + notif artisan", async () => {
    const { deps, notifs, repo } = chatDeps();
    const m = await sendClientMessage(deps, "good", 10, "Une question", NOW);
    expect(m.auteur).toBe("client");
    expect(repo.messages).toHaveLength(1);
    expect(notifs[0].titre).toContain("Jean Dupont");
  });
  it("conversation d'un autre client → Forbidden (pas de message)", async () => {
    const { deps, repo } = chatDeps();
    await expect(sendClientMessage(deps, "good", 20, "x", NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.messages).toHaveLength(0);
  });
  it("rate-limit → TooManyRequests", async () => {
    const { deps } = chatDeps({ rateLimiter: { check: async () => false } });
    await expect(sendClientMessage(deps, "good", 10, "x", NOW)).rejects.toBeInstanceOf(TooManyRequestsError);
  });
});

describe("markClientMessagesAsRead", () => {
  it("conversation du client → succès", async () => {
    const { deps } = chatDeps();
    expect(await markClientMessagesAsRead(deps, "good", 10, NOW)).toEqual({ success: true });
  });
  it("autre client → Forbidden", async () => {
    const { deps } = chatDeps();
    await expect(markClientMessagesAsRead(deps, "good", 20, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("demanderModification", () => {
  function modifDeps(over: Partial<DemanderModificationDeps> = {}): { deps: DemanderModificationDeps; sent: any[] } {
    const sent: any[] = [];
    const deps: DemanderModificationDeps = {
      access: access(),
      artisanReader: { getArtisanPublic: async () => ({ email: "pro@acme.fr" }) },
      clients: { getById: async () => ({ nom: "Dupont", prenom: "Jean", email: "jean@x.fr" }) },
      email: { send: async (m) => { sent.push(m); } },
      rateLimiter: { check: async () => true },
      ...over,
    };
    return { deps, sent };
  }

  it("succès → email à l'artisan (corps échappé)", async () => {
    const { deps, sent } = modifDeps();
    expect(await demanderModification(deps, "good", "<b>changez mon tel</b>", NOW)).toEqual({ success: true });
    expect(sent[0].to).toBe("pro@acme.fr");
    expect(sent[0].body).toContain("&lt;b&gt;");
  });
  it("artisan sans email → NotFound (pas d'email envoyé)", async () => {
    const { deps, sent } = modifDeps({ artisanReader: { getArtisanPublic: async () => ({ email: null }) } });
    await expect(demanderModification(deps, "good", "msg", NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(sent).toHaveLength(0);
  });
  it("rate-limit → TooManyRequests", async () => {
    const { deps } = modifDeps({ rateLimiter: { check: async () => false } });
    await expect(demanderModification(deps, "good", "msg", NOW)).rejects.toBeInstanceOf(TooManyRequestsError);
  });
  it("token invalide → Unauthorized", async () => {
    const { deps } = modifDeps();
    await expect(demanderModification(deps, "bad", "msg", NOW)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

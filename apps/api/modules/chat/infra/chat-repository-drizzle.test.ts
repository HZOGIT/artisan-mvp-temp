import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ChatRepositoryDrizzle } from "./chat-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9991081;
const UID_B = 9991082;

describe.skipIf(!URL)("ChatRepositoryDrizzle (conversations/messages scopés tenant sous RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ChatRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let convB = 0;

  const cleanup = async () => {
    for (const uid of [UID_A, UID_B]) {
      await admin.query('delete from messages where "conversationId" in (select id from conversations where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from conversations where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
    }
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID_A])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID_B])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom,prenom,email) values ($1,$2,$3,$4) returning id', [artisanA, "Dupont", "Jean", "jean@test.com"])).rows[0].id;
    const clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "SecretB"])).rows[0].id;
    convB = (await admin.query('insert into conversations ("artisanId","clientId",statut) values ($1,$2,$3) returning id', [artisanB, clientB, "ouverte"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const ctxA = () => ({ artisanId: artisanA, userId: 0 });
  const ctxB = () => ({ artisanId: artisanB, userId: 0 });

  it("getOrCreateConversation + createMessage : maj dernierMessage + incrément nonLuClient", async () => {
    const conv = await repo.getOrCreateConversation(ctxA(), clientA);
    expect(conv.statut).toBe("ouverte");
    await repo.createMessage(ctxA(), { conversationId: conv.id, auteur: "artisan", contenu: "Bonjour le client" });
    const [reloaded] = await repo.listConversations(ctxA());
    expect(reloaded.dernierMessage).toBe("Bonjour le client");
    expect(reloaded.nonLuClient).toBe(1);
    expect(reloaded.client?.email).toBe("jean@test.com"); // enrichissement client
  });

  it("getOrCreateConversation : réutilise la conversation ouverte (sans sujet)", async () => {
    const c1 = await repo.getOrCreateConversation(ctxA(), clientA);
    const c2 = await repo.getOrCreateConversation(ctxA(), clientA);
    expect(c2.id).toBe(c1.id);
  });

  it("isolation : A ne voit pas la conversation de B (getConversationOwned → null)", async () => {
    expect(await repo.getConversationOwned(ctxA(), convB)).toBeNull();
    expect(await repo.getConversationOwned(ctxB(), convB)).not.toBeNull();
  });

  it("markMessagesAsRead(artisan) : remet nonLuArtisan à 0 + getUnreadCount", async () => {
    const conv = await repo.getOrCreateConversation(ctxA(), clientA);
    // simule un message client non lu (incrémente nonLuArtisan)
    await repo.createMessage(ctxA(), { conversationId: conv.id, auteur: "client", contenu: "réponse client" });
    expect(await repo.getUnreadCount(ctxA())).toBeGreaterThanOrEqual(1);
    await repo.markMessagesAsRead(ctxA(), conv.id, "artisan");
    const reloaded = await repo.getConversationOwned(ctxA(), conv.id);
    expect(reloaded?.nonLuArtisan).toBe(0);
  });

  it("clientOwned : true pour le client de A, false cross-tenant", async () => {
    expect(await repo.clientOwned(ctxA(), clientA)).toBe(true);
    expect(await repo.clientOwned(ctxB(), clientA)).toBe(false);
  });
});

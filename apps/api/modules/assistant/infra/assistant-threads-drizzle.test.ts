import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { AssistantThreadWriterDrizzle } from "./assistant-thread-writer-drizzle";
import { AssistantThreadsRepositoryDrizzle } from "./assistant-threads-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9952231;
const UID_B = 9952232;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : threads/messages de l'assistant IA. Écriture (writer) + lecture (repository) SOUS LE TENANT
// (withTenant + filtre artisanId). `ai_messages` (sans artisanId) est scopé via le thread parent. On
// vérifie titre tronqué, persistance, tri, et anti-IDOR cross-tenant (B ne lit/modifie pas A).
describe.skipIf(!URL)("Assistant threads Drizzle (writer + repository, RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const writer = new AssistantThreadWriterDrizzle(app.db);
  const repo = new AssistantThreadsRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from ai_messages where "threadId" in (select id from ai_threads where "artisanId" ${sub})`, [uids]);
    await admin.query(`delete from ai_threads where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "IA A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "IA B"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("createThread : titre = 80 premiers caractères (+ … si tronqué), scopé artisan", async () => {
    const court = await writer.createThread(ctx(artisanA), "Question courte");
    const long = await writer.createThread(ctx(artisanA), "x".repeat(100));
    const tCourt = await repo.getThreadOwned(ctx(artisanA), court);
    const tLong = await repo.getThreadOwned(ctx(artisanA), long);
    expect(tCourt?.title).toBe("Question courte");
    expect(tLong?.title).toBe("x".repeat(80) + "…");
    expect(tCourt?.artisanId).toBe(artisanA);
  });

  it("addMessage : insère les messages (triés asc) ; anti-IDOR sur l'update du thread", async () => {
    const threadId = await writer.createThread(ctx(artisanA), "Conversation");
    await writer.addMessage(ctx(artisanA), threadId, "user", "Bonjour");
    await writer.addMessage(ctx(artisanA), threadId, "assistant", "Bonjour, comment aider ?");
    const msgs = await repo.listMessages(ctx(artisanA), threadId, 50);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]); // tri asc createdAt
    expect(msgs[0].transcript).toBe("Bonjour");
    // anti-IDOR : B ajoute un message mais NE met PAS à jour le thread de A (update scopé artisanId)
    const before = (await admin.query('select "lastMessageAt" from ai_threads where id=$1', [threadId])).rows[0].lastMessageAt;
    await writer.addMessage(ctx(artisanB), threadId, "user", "intrus");
    const after = (await admin.query('select "lastMessageAt" from ai_threads where id=$1', [threadId])).rows[0].lastMessageAt;
    expect(after).toEqual(before); // thread de A non touché par B
  });

  it("listThreads : scopé tenant, tri desc lastMessageAt ; anti-IDOR (B → [])", async () => {
    const threads = await repo.listThreads(ctx(artisanA), 50);
    expect(threads.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < threads.length; i++) {
      expect(threads[i - 1].lastMessageAt >= threads[i].lastMessageAt).toBe(true);
    }
    expect(await repo.listThreads(ctx(artisanB), 50)).toEqual([]);
  });

  it("getThreadOwned : anti-IDOR — le thread de A est invisible sous le tenant B", async () => {
    const threadId = await writer.createThread(ctx(artisanA), "Privé A");
    expect((await repo.getThreadOwned(ctx(artisanA), threadId))?.id).toBe(threadId);
    expect(await repo.getThreadOwned(ctx(artisanB), threadId)).toBeNull();
  });
});

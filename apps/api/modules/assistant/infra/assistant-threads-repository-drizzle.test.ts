import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { AssistantThreadsRepositoryDrizzle } from "./assistant-threads-repository-drizzle";
import { getMessages, getThreads } from "../application/read-use-cases";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9971061;
const UID_B = 9971062;

describe.skipIf(!URL)("AssistantThreadsRepositoryDrizzle (threads/messages scopés tenant sous RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new AssistantThreadsRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let threadA = 0;
  let threadB = 0;

  const cleanup = async () => {
    await admin.query('delete from ai_messages where "threadId" in (select id from ai_threads where "artisanId" in (select id from artisans where "userId" in ($1,$2)))', [UID_A, UID_B]);
    await admin.query('delete from ai_threads where "artisanId" in (select id from artisans where "userId" in ($1,$2))', [UID_A, UID_B]);
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UID_A, UID_B]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID_A])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID_B])).rows[0].id;
    threadA = (await admin.query('insert into ai_threads ("artisanId",title,"lastMessageAt") values ($1,$2,now()) returning id', [artisanA, "Thread A"])).rows[0].id;
    threadB = (await admin.query('insert into ai_threads ("artisanId",title,"lastMessageAt") values ($1,$2,now()) returning id', [artisanB, "Thread B"])).rows[0].id;
    await admin.query('insert into ai_messages ("threadId",role,transcript,"createdAt") values ($1,$2,$3, now() - interval \'1 minute\'),($1,$4,$5, now())', [threadA, "user", "bonjour", "assistant", "salut"]);
    await admin.query('insert into ai_messages ("threadId",role,transcript) values ($1,$2,$3)', [threadB, "user", "secret B"]);
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getThreads : A ne voit que son thread ; B que le sien (isolation RLS)", async () => {
    const tA = await getThreads(repo, { artisanId: artisanA, userId: 0 });
    expect(tA.map((t) => t.id)).toEqual([threadA]);
    const tB = await getThreads(repo, { artisanId: artisanB, userId: 0 });
    expect(tB.map((t) => t.id)).toEqual([threadB]);
  });

  it("getMessages : A lit les messages de SON thread, triés createdAt asc", async () => {
    const msgs = await getMessages(repo, { artisanId: artisanA, userId: 0 }, threadA);
    expect(msgs.map((m) => m.transcript)).toEqual(["bonjour", "salut"]);
  });

  it("getMessages : A ne lit PAS les messages du thread de B (anti-IDOR via thread parent) → []", async () => {
    const msgs = await getMessages(repo, { artisanId: artisanA, userId: 0 }, threadB);
    expect(msgs).toEqual([]);
  });
});

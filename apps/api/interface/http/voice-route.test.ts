import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../app";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-voicep";
const UID = 9991181;
const UID_OTHER = 9991182;

async function signToken(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@test.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
}

// E2E `POST /api/voice/persist` (auth cookie) : persiste les transcripts dans un thread du tenant.
describe.skipIf(!URL)("POST /api/voice/persist (auth cookie)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let threadId = 0;

  const cleanup = async () => {
    for (const uid of [UID, UID_OTHER]) {
      await admin.query('delete from ai_messages where "threadId" in (select id from ai_threads where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from ai_threads where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email) values ($1,$2),($3,$4)", [UID, `u${UID}@test.fr`, UID_OTHER, `u${UID_OTHER}@test.fr`]);
    const artisanId = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID])).rows[0].id;
    await admin.query('insert into artisans ("userId") values ($1)', [UID_OTHER]);
    threadId = (await admin.query('insert into ai_threads ("artisanId",title,"lastMessageAt") values ($1,$2,now()) returning id', [artisanId, "Voix"])).rows[0].id;
    app = buildApp({ jwtSecret: SECRET });
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  const post = (payload: object, token?: string) =>
    app.inject({ method: "POST", url: "/api/voice/persist", headers: { "content-type": "application/json", ...(token ? { cookie: `token=${token}` } : {}) }, payload: JSON.stringify(payload) });

  it("sans cookie → 401", async () => {
    expect((await post({ threadId, userTranscript: "x" })).statusCode).toBe(401);
  });

  it("transcript manquant → 400", async () => {
    const token = await signToken(UID);
    expect((await post({ threadId }, token)).statusCode).toBe(400);
  });

  it("thread d'un autre tenant → 404 (anti-IDOR)", async () => {
    const tokenOther = await signToken(UID_OTHER);
    expect((await post({ threadId, userTranscript: "intrus" }, tokenOther)).statusCode).toBe(404);
  });

  it("succès → 200 {ok} + messages persistés (source voice)", async () => {
    const token = await signToken(UID);
    const res = await post({ threadId, userTranscript: "bonjour", assistantTranscript: "salut !" }, token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const { rows } = await admin.query('select role, metadata from ai_messages where "threadId"=$1 order by id', [threadId]);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(rows[0].metadata).toEqual({ source: "voice" });
  });
});

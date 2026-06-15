import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../app";
import { FakeLlmAgenticPort } from "../../modules/assistant/infra/llm-agentic-fake";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-assist";
const UID = 9991171;

async function signToken(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@test.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
}

// E2E `POST /api/assistant/stream` (SSE, mode AGENTIQUE) via le routeur monté + le registry réel
// câblé dans buildApp. Provider agentique = FakeLlmAgenticPort (aucun réseau). Vérifie 401 + flux SSE.
describe.skipIf(!URL)("POST /api/assistant/stream (SSE agentique, auth cookie)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from ai_messages where "threadId" in (select id from ai_threads where "artisanId" in (select id from artisans where "userId"=$1))', [UID]);
    await admin.query('delete from ai_threads where "artisanId" in (select id from artisans where "userId"=$1)', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email) values ($1,$2)", [UID, `u${UID}@test.fr`]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Plomberie X"]);
    app = buildApp({ jwtSecret: SECRET, llmAgentic: new FakeLlmAgenticPort([{ text: ["Bonjour", " artisan"] }]) });
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("sans cookie → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/assistant/stream", headers: { "content-type": "application/json" }, payload: JSON.stringify({ message: "salut" }) });
    expect(res.statusCode).toBe(401);
  });

  it("message vide → 400", async () => {
    const token = await signToken(UID);
    const res = await app.inject({ method: "POST", url: "/api/assistant/stream", headers: { "content-type": "application/json", cookie: `token=${token}` }, payload: JSON.stringify({ message: "" }) });
    expect(res.statusCode).toBe(400);
  });

  it("message valide → 200 text/event-stream + chunks SSE + thread persisté", async () => {
    const token = await signToken(UID);
    const res = await app.inject({ method: "POST", url: "/api/assistant/stream", headers: { "content-type": "application/json", cookie: `token=${token}` }, payload: JSON.stringify({ message: "Aide-moi" }) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain('"threadId"');
    expect(res.body).toContain('data: {"content":"Bonjour"}');
    expect(res.body).toContain('data: {"content":" artisan"}');
    // persistance : un thread + 2 messages (user + assistant)
    const { rows } = await admin.query('select count(*)::int n from ai_messages where "threadId" in (select id from ai_threads where "artisanId" in (select id from artisans where "userId"=$1))', [UID]);
    expect(rows[0].n).toBe(2);
  });
});

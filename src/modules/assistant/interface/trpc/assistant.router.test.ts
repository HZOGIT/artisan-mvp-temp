import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { FakeLlmPort } from "../../../../shared/ports/fakes";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9960311;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `assistant.*`) : historique conversations + générateurs IA (protégé, LLM faké).
describe.skipIf(!URL)("assistant.router e2e (protégé, LLM faké)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Assistant SARL"]);
    app = buildApp({ jwtSecret: SECRET, llm: new FakeLlmPort("[]") });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getThreads / generateDevis sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "assistant.getThreads", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "assistant.generateDevis", { description: "Réfection toiture" })).statusCode).toBe(401);
  });

  it("getThreads + suggestRelances (cookie) → 200 (tenant vierge → [])", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "assistant.getThreads", undefined, tok)).statusCode).toBe(200);
    const sugg = await injectTrpc(app, "GET", "assistant.suggestRelances", undefined, tok);
    expect(sugg.statusCode).toBe(200);
    expect(Array.isArray(sugg.json().result.data)).toBe(true);
  });

  it("validation : generateDevis avec description vide → 400", async () => {
    const res = await injectTrpc(app, "POST", "assistant.generateDevis", { description: "" }, await jwt(UID));
    expect(res.statusCode).toBe(400);
  });
});

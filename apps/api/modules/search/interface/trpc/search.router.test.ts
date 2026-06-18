import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9947181;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `search.global`) : recherche globale cross-domaine du tenant (protégée).
describe.skipIf(!URL)("search.router e2e (recherche globale protégée)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Search SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("global sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "search.global", { query: "test" })).statusCode).toBe(401);
  });

  it("global (cookie) avec requête valide → 200", async () => {
    const res = await injectTrpc(app, "GET", "search.global", { query: "Durand" }, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toBeTruthy();
  });

  it("validation : requête vide → 400 ; requête > 100 caractères → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "search.global", { query: "" }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "GET", "search.global", { query: "x".repeat(101) }, tok)).statusCode).toBe(400);
  });
});

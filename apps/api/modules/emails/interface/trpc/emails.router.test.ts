import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9951221;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `emails.list`) : journal d'emails du tenant (lecture seule, protégé).
describe.skipIf(!URL)("emails.router e2e (journal protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Emails SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("list sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "emails.list", undefined)).statusCode).toBe(401);
  });

  it("list (cookie) → 200, tableau ; filtre par entité accepté", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "emails.list", undefined, tok)).statusCode).toBe(200);
    const filtered = await injectTrpc(app, "GET", "emails.list", { entiteType: "devis", entiteId: 1 }, tok);
    expect(filtered.statusCode).toBe(200);
    expect(Array.isArray(filtered.json().result.data)).toBe(true);
  });

  it("validation : limit > 500 → 400 ; entiteType hors enum → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "emails.list", { limit: 9999 }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "GET", "emails.list", { entiteType: "sms" }, tok)).statusCode).toBe(400);
  });
});

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9957281;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `alertesPrevisions.*`) : config + historique des alertes du prévisionnel (protégé).
describe.skipIf(!URL)("alertesPrevisions.router e2e (protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Alertes SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getConfig / saveConfig sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "alertesPrevisions.getConfig", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "alertesPrevisions.saveConfig", { actif: true })).statusCode).toBe(401);
  });

  it("getConfig + getHistorique (cookie) → 200", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "alertesPrevisions.getConfig", undefined, tok)).statusCode).toBe(200);
    expect((await injectTrpc(app, "GET", "alertesPrevisions.getHistorique", undefined, tok)).statusCode).toBe(200);
  });

  it("saveConfig (cookie) valide → 200 ; fréquence hors enum → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "POST", "alertesPrevisions.saveConfig", { actif: true, frequenceVerification: "quotidien" }, tok)).statusCode).toBe(200);
    expect((await injectTrpc(app, "POST", "alertesPrevisions.saveConfig", { frequenceVerification: "annuel" }, tok)).statusCode).toBe(400);
  });
});

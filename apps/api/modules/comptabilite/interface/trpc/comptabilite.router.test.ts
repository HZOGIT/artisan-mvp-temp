import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9944151;
const EMAIL = `u${UID}@t.fr`;
const UID2 = 9944152;
const EMAIL2 = `u${UID2}@t.fr`;

const jwt = (userId: number, email: string = EMAIL) =>
  new SignJWT({ userId, email }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `comptabilite.*`) : lectures comptables (FEC/TVA/grand-livre/balance/journal),
// gardées par la permission `comptabilite.voir` (admin bypasse).
describe.skipIf(!URL)("comptabilite.router e2e (gardé par permission)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [UID2]);
    await admin.query("delete from users where id=$1", [UID2]);
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    const artisanResult = await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Compta SARL"]);
    const artisanId = artisanResult.rows[0].id;
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,$3,$4,$5)', [UID2, EMAIL2, 'x', 'artisan', artisanId]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "comptabilite.getBalance", undefined)).statusCode).toBe(401);
  });

  it("authentifié SANS la permission `comptabilite.voir` → 403", async () => {
    expect((await injectTrpc(app, "GET", "comptabilite.getBalance", undefined, await jwt(UID2, EMAIL2))).statusCode).toBe(403);
  });

  it("avec la permission `comptabilite.voir` → 200 (balance + FEC preview)", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [UID, "comptabilite.voir"]);
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "GET", "comptabilite.getBalance", undefined, tok)).statusCode).toBe(200);
    expect((await injectTrpc(app, "GET", "comptabilite.getFecPreview", undefined, tok)).statusCode).toBe(200);
  });
});

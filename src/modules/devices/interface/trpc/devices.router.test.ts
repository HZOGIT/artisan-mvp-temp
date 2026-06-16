import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9943141;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `devices.*`) : appareils/sessions de l'utilisateur courant (scopé userId).
describe.skipIf(!URL)("devices.router e2e (sessions protégées)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Devices SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("list / revoke / revokeAll sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "devices.list", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "devices.revoke", { deviceId: 1 })).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "devices.revokeAll", {})).statusCode).toBe(401);
  });

  it("list (cookie) → 200, tableau (aucun appareil enregistré → [])", async () => {
    const res = await injectTrpc(app, "GET", "devices.list", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data)).toBe(true);
  });

  it("revokeAll (cookie) → 200 (révoque les autres sessions, idempotent si aucune)", async () => {
    const res = await injectTrpc(app, "POST", "devices.revokeAll", {}, await jwt(UID));
    expect(res.statusCode).toBe(200);
  });

  it("validation : revoke avec deviceId non positif → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "POST", "devices.revoke", { deviceId: 0 }, tok)).statusCode).toBe(400);
    expect((await injectTrpc(app, "POST", "devices.revoke", { deviceId: -3 }, tok)).statusCode).toBe(400);
  });
});

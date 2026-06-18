import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9949201;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `calendrier.*`) : flux iCal du tenant (génération + rotation du jeton, protégé).
describe.skipIf(!URL)("calendrier.router e2e (flux iCal protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Cal SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getIcalFeed / regenerateIcalFeed sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "calendrier.getIcalFeed", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "calendrier.regenerateIcalFeed", {})).statusCode).toBe(401);
  });

  it("getIcalFeed (cookie) → 200, path stable (jeton généré à la 1re demande)", async () => {
    const tok = await jwt(UID);
    const r1 = await injectTrpc(app, "GET", "calendrier.getIcalFeed", undefined, tok);
    expect(r1.statusCode).toBe(200);
    expect(r1.json().result.data.path).toBeTruthy();
    const r2 = await injectTrpc(app, "GET", "calendrier.getIcalFeed", undefined, tok);
    expect(r2.json().result.data.path).toBe(r1.json().result.data.path); // idempotent
  });

  it("regenerateIcalFeed (cookie) → 200 et fait tourner le jeton (path différent)", async () => {
    const tok = await jwt(UID);
    const before = (await injectTrpc(app, "GET", "calendrier.getIcalFeed", undefined, tok)).json().result.data.path;
    const reg = await injectTrpc(app, "POST", "calendrier.regenerateIcalFeed", {}, tok);
    expect(reg.statusCode).toBe(200);
    expect(reg.json().result.data.path).not.toBe(before);
  });
});

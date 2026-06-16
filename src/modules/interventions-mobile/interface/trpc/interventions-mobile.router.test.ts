import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9956271;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `interventionsMobile.*`) : app mobile technicien (protégé, scopé tenant).
describe.skipIf(!URL)("interventionsMobile.router e2e (protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Mobile SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getTodayInterventions / startIntervention sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "interventionsMobile.getTodayInterventions", undefined)).statusCode).toBe(401);
    expect((await injectTrpc(app, "POST", "interventionsMobile.startIntervention", { interventionId: 1 })).statusCode).toBe(401);
  });

  it("getTodayInterventions (cookie) → 200, tableau (journée vierge → [])", async () => {
    const res = await injectTrpc(app, "GET", "interventionsMobile.getTodayInterventions", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().result.data)).toBe(true);
  });

  it("validation : startIntervention avec interventionId non positif → 400", async () => {
    const res = await injectTrpc(app, "POST", "interventionsMobile.startIntervention", { interventionId: 0 }, await jwt(UID));
    expect(res.statusCode).toBe(400);
  });

  it("startIntervention sur une intervention inexistante → 404", async () => {
    const res = await injectTrpc(app, "POST", "interventionsMobile.startIntervention", { interventionId: 999999999 }, await jwt(UID));
    expect(res.statusCode).toBe(404);
  });
});

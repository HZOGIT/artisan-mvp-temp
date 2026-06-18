import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9945161;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `dashboard.*`) : 10 lectures agrégées du tenant (protégées).
describe.skipIf(!URL)("dashboard.router e2e (lectures protégées)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Dashboard SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getStats sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "dashboard.getStats", undefined)).statusCode).toBe(401);
  });

  it("lectures agrégées (cookie) → 200 (tenant vierge)", async () => {
    const tok = await jwt(UID);
    for (const proc of ["dashboard.getStats", "dashboard.getRecentActivity", "dashboard.getMonthlyCA", "dashboard.getTopClients", "dashboard.getObjectifs", "dashboard.getAlerts"]) {
      const res = await injectTrpc(app, "GET", proc, undefined, tok);
      expect(res.statusCode, proc).toBe(200);
    }
  });

  it("validation : getRecentActivity limit > 500 → 400", async () => {
    const res = await injectTrpc(app, "GET", "dashboard.getRecentActivity", { limit: 9999 }, await jwt(UID));
    expect(res.statusCode).toBe(400);
  });
});

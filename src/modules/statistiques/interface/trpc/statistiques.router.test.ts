import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9946171;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `statistiques.getDevisStats`) : agrégats devis du tenant (protégé).
describe.skipIf(!URL)("statistiques.router e2e (agrégats protégés)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "Stats SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getDevisStats sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "statistiques.getDevisStats", undefined)).statusCode).toBe(401);
  });

  it("getDevisStats (cookie) → 200 (agrégats, tenant vierge)", async () => {
    const res = await injectTrpc(app, "GET", "statistiques.getDevisStats", undefined, await jwt(UID));
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data).toBeTruthy();
  });
});

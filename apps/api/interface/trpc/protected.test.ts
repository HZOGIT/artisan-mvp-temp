import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../app";
import { createDbClient } from "../../shared/db";
import { DrizzleTenantResolver } from "../../shared/tenant/drizzle-tenant-resolver";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const USER_ID = 9930001;

async function signToken(userId: number, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

describe.skipIf(!URL)("protectedProcedure e2e (resolver DB + cookie)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanId = 0;
  let appServer: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query("delete from artisans where \"userId\" = $1", [USER_ID]);
    await admin.query("delete from users where id = $1", [USER_ID]);
    await admin.query("insert into users (id, email, password, role) values ($1, $2, 'x', 'artisan')", [
      USER_ID,
      "resolver@test.fr",
    ]);
    const ins = await admin.query("insert into artisans (\"userId\") values ($1) returning id", [USER_ID]);
    artisanId = ins.rows[0].id;
    appServer = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db) });
  });

  afterAll(async () => {
    await appServer.close();
    await admin.query("delete from artisans where \"userId\" = $1", [USER_ID]);
    await admin.query("delete from users where id = $1", [USER_ID]);
    await app.close();
    await admin.end();
  });

  it("avec un cookie token valide → whoami renvoie le tenant résolu", async () => {
    const token = await signToken(USER_ID, "resolver@test.fr");
    const res = await appServer.inject({
      method: "GET",
      url: "/api/trpc/whoami",
      headers: { cookie: `token=${token}` },
    });
    expect(res.statusCode).toBe(200);
    // Réponse sérialisée superjson : `result.data` enveloppé dans `{ json: … }`.
    expect(res.json()).toMatchObject({ result: { data: { json: { artisanId, userId: USER_ID, role: "artisan" } } } });
  });

  it("sans cookie → UNAUTHORIZED (401)", async () => {
    const res = await appServer.inject({ method: "GET", url: "/api/trpc/whoami" });
    expect(res.statusCode).toBe(401);
  });

  it("token d'un user sans artisan → UNAUTHORIZED (pas de tenant résolu)", async () => {
    const token = await signToken(123456789, "no-artisan@test.fr");
    const res = await appServer.inject({
      method: "GET",
      url: "/api/trpc/whoami",
      headers: { cookie: `token=${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

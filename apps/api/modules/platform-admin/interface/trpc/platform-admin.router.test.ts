import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DrizzleUserRoleReader } from "../../../../shared/tenant/role-reader";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UID_USER = 9970001;
const UID_ADMIN_STAFF = 9970002;
const UID_ADMIN_TENANT = 9970003;

async function signToken(userId: number, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

describe.skipIf(!URL)("platformAdmin.artisans.list L3", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from artisans where "userId" = $1', [uid]);
    await admin.query("delete from users where id = $1", [uid]);
  };

  beforeAll(async () => {
    /* utilisateur sans rôle admin */
    await purge(UID_USER);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID_USER, `u${UID_USER}@t.fr`]);

    /* staff admin Operioz — rôle admin SANS artisan */
    await purge(UID_ADMIN_STAFF);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','admin')", [UID_ADMIN_STAFF, `u${UID_ADMIN_STAFF}@t.fr`]);

    /* admin d'un tenant artisan — rôle admin AVEC artisan */
    await purge(UID_ADMIN_TENANT);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','admin')", [UID_ADMIN_TENANT, `u${UID_ADMIN_TENANT}@t.fr`]);
    await admin.query('insert into artisans ("userId") values ($1)', [UID_ADMIN_TENANT]);

    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(appDb.db),
      roleReader: new DrizzleUserRoleReader(appDb.db),
    });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UID_USER, UID_ADMIN_STAFF, UID_ADMIN_TENANT]) await purge(uid);
    await appDb.close();
    await admin.end();
  });

  it("sans cookie → 401", async () => {
    const res = await injectTrpc(server, "GET", "platformAdmin.artisans.list", {});
    expect(res.statusCode).toBe(401);
  });

  it("rôle artisan → 403", async () => {
    const tok = await signToken(UID_USER, `u${UID_USER}@t.fr`);
    const res = await injectTrpc(server, "GET", "platformAdmin.artisans.list", {}, tok);
    expect(res.statusCode).toBe(403);
  });

  it("rôle admin avec tenant résolu (artisanId) → 403", async () => {
    const tok = await signToken(UID_ADMIN_TENANT, `u${UID_ADMIN_TENANT}@t.fr`);
    const res = await injectTrpc(server, "GET", "platformAdmin.artisans.list", {}, tok);
    expect(res.statusCode).toBe(403);
  });

  it("rôle admin sans tenant → 200 + voit TOUS les artisans (cross-tenant)", async () => {
    const tok = await signToken(UID_ADMIN_STAFF, `u${UID_ADMIN_STAFF}@t.fr`);
    const res = await injectTrpc(server, "GET", "platformAdmin.artisans.list", {}, tok);
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { result: { data: { items: { id: number }[]; total: number } } }).result.data;
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe("number");
    /* Le staff voit l'artisan de UID_ADMIN_TENANT (un tenant distinct) — pas de filtre RLS par artisanId. */
    const artisanRow = await admin.query<{ id: number }>('select id from artisans where "userId" = $1', [UID_ADMIN_TENANT]);
    const artisanId = artisanRow.rows[0]?.id;
    expect(artisanId).toBeDefined();
    expect(data.items.some((a) => a.id === artisanId)).toBe(true);
    expect(data.total).toBeGreaterThanOrEqual(1);
  });
});

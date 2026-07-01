import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

/** L3 authz — gate statistiques.voir sur getDevisStats (OPE-1022). */

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

/** owner du compte artisan */
const OWNER = 9946201;
/** collaborateur MEMBRE non-owner rattaché au même artisan (anti-674 : pas l'owner) */
const MEMBER = 9946202;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

describe.skipIf(!URL)("statistiques.router authz — gate statistiques.voir (OPE-1022)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from permissions_utilisateur where "userId" in ($1,$2)', [OWNER, MEMBER]);
    await admin.query('delete from artisans where "userId"=$1', [OWNER]);
    await admin.query("delete from users where id in ($1,$2)", [OWNER, MEMBER]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [OWNER, `u${OWNER}@t.fr`]);
    const { rows } = await admin.query<{ id: number }>('insert into artisans ("userId") values ($1) returning id', [OWNER]);
    const artisanId = rows[0].id;
    await admin.query(
      'insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)',
      [MEMBER, `u${MEMBER}@t.fr`, artisanId],
    );
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(appDb.db) });
  });

  afterAll(async () => {
    await server.close();
    await cleanup();
    await appDb.close();
    await admin.end();
  });

  it("getDevisStats sans cookie → 401", async () => {
    expect((await injectTrpc(server, "GET", "statistiques.getDevisStats", undefined)).statusCode).toBe(401);
  });

  it("getDevisStats — membre sans statistiques.voir → 403", async () => {
    const tok = await jwt(MEMBER);
    expect((await injectTrpc(server, "GET", "statistiques.getDevisStats", undefined, tok)).statusCode).toBe(403);
  });

  it("getDevisStats — owner bypasse la garde → non-403 (200)", async () => {
    const tok = await jwt(OWNER);
    expect((await injectTrpc(server, "GET", "statistiques.getDevisStats", undefined, tok)).statusCode).not.toBe(403);
  });

  it("getDevisStats — membre AVEC statistiques.voir → non-403", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [MEMBER, "statistiques.voir"]);
    const tok = await jwt(MEMBER);
    expect((await injectTrpc(server, "GET", "statistiques.getDevisStats", undefined, tok)).statusCode).not.toBe(403);
    await admin.query('delete from permissions_utilisateur where "userId"=$1 and permission=$2', [MEMBER, "statistiques.voir"]);
  });
});

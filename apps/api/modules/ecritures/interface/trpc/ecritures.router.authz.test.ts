import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { EcritureRepositoryDrizzle } from "../../infra/ecriture-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

/** L3 — garde de permission sur balance/grandLivre/exportFec du module écritures (OPE-792). */

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

/** owner du compte artisan */
const OWNER = 9942401;
/** collaborateur MEMBRE non-owner rattaché au même artisan (OPE-674 : ne pas utiliser l'owner pour les tests 403) */
const MEMBER = 9942402;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

function q(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

describe.skipIf(!URL)("ecritures.router authz — permission gates (OPE-792)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from permissions_utilisateur where "userId" in ($1,$2)', [OWNER, MEMBER]);
    await admin.query('delete from ecritures_comptables where "artisanId" in (select id from artisans where "userId"=$1)', [OWNER]);
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
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(appDb.db), ecritureRepo: new EcritureRepositoryDrizzle(appDb.db) });
  });

  afterAll(async () => {
    await server.close();
    await cleanup();
    await appDb.close();
    await admin.end();
  });

  it("balance — membre sans comptabilite.voir → 403", async () => {
    const tok = await jwt(MEMBER);
    expect((await q(server, "ecritures.balance", undefined, tok)).statusCode).toBe(403);
  });

  it("balance — owner bypasse la garde → non-403", async () => {
    const tok = await jwt(OWNER);
    expect((await q(server, "ecritures.balance", undefined, tok)).statusCode).not.toBe(403);
  });

  it("balance — membre AVEC comptabilite.voir → non-403", async () => {
    await admin.query('insert into permissions_utilisateur ("userId",permission,autorise) values ($1,$2,true)', [MEMBER, "comptabilite.voir"]);
    const tok = await jwt(MEMBER);
    expect((await q(server, "ecritures.balance", undefined, tok)).statusCode).not.toBe(403);
    await admin.query('delete from permissions_utilisateur where "userId"=$1 and permission=$2', [MEMBER, "comptabilite.voir"]);
  });

  it("grandLivre — membre sans comptabilite.voir → 403", async () => {
    const tok = await jwt(MEMBER);
    expect((await q(server, "ecritures.grandLivre", undefined, tok)).statusCode).toBe(403);
  });

  it("grandLivre — owner bypasse la garde → non-403", async () => {
    const tok = await jwt(OWNER);
    expect((await q(server, "ecritures.grandLivre", undefined, tok)).statusCode).not.toBe(403);
  });

  it("exportFec — membre sans comptabilite.voir → 403", async () => {
    const tok = await jwt(MEMBER);
    expect((await q(server, "ecritures.exportFec", { debut: "2026-01-01", fin: "2026-12-31" }, tok)).statusCode).toBe(403);
  });

  it("exportFec — owner bypasse la garde → non-403", async () => {
    const tok = await jwt(OWNER);
    expect((await q(server, "ecritures.exportFec", { debut: "2026-01-01", fin: "2026-12-31" }, tok)).statusCode).not.toBe(403);
  });
});

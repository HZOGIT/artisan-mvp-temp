import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ArtisanRepositoryDrizzle } from "../../../artisan/infra/artisan-repository-drizzle";
import { FakeStripePort } from "../../../../shared/ports/stripe-adapter";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

/** Plage d'ids isolée — anti-collision run parallèle. */
const UA = 9971801; /** owner du tenant */
const UC = 9971802; /** collaborateur non-owner du même tenant (anti-674) */

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

describe.skipIf(!URL)("connect.router — gate ownerProcedure sur startOnboarding", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\" in ($1,$2)", [UA, UC]);
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UA, UC]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UC]);
  };

  beforeAll(async () => {
    await purge();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    const { rows } = await admin.query(
      'insert into artisans ("userId","nomEntreprise",email) values ($1,$2,$3) returning id',
      [UA, "Connect Gate Test", `u${UA}@t.fr`],
    );
    const artisanId: number = rows[0].id;
    await admin.query(
      'insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)',
      [UC, `u${UC}@t.fr`, artisanId],
    );
    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(appDb.db),
      artisanRepo: new ArtisanRepositoryDrizzle(appDb.db),
      stripePort: new FakeStripePort(),
    });
  });

  afterAll(async () => {
    await server.close();
    await purge();
    await appDb.close();
    await admin.end();
  });

  it("collaborateur non-owner → startOnboarding 403", async () => {
    const tC = await token(UC);
    const res = await injectTrpc(server, "POST", "connect.startOnboarding", undefined, tC);
    expect(res.statusCode).toBe(403);
  });

  it("owner → startOnboarding 200", async () => {
    const tA = await token(UA);
    const res = await injectTrpc(server, "POST", "connect.startOnboarding", undefined, tA);
    expect(res.statusCode).toBe(200);
  });

  it("collaborateur non-owner → status 200 (lecture publique dans le tenant)", async () => {
    const tC = await token(UC);
    const res = await injectTrpc(server, "GET", "connect.status", undefined, tC);
    expect(res.statusCode).toBe(200);
  });
});

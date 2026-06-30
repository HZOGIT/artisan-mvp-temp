import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ArtisanRepositoryDrizzle } from "../../artisan/infra/artisan-repository-drizzle";
import { FakeStripePort } from "../../../shared/ports/stripe-adapter";
import { startOnboarding, getConnectStatus } from "./use-cases";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UA = 994601;
const UB = 994602;
const ctx = (id: number) => ({ artisanId: id, userId: 1 });

describe.skipIf(!URL)("connect — startOnboarding + status (L2 — app_tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ArtisanRepositoryDrizzle(app.db);
  const stripe = new FakeStripePort();
  const deps = { artisanRepo: repo, stripe, appUrl: "https://staging.operioz.com" };
  let aId = 0;
  let bId = 0;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UA, UB]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    aId = (await admin.query('insert into artisans ("userId","nomEntreprise",email) values ($1,$2,$3) returning id', [UA, "Connect Test A", "a@test.fr"])).rows[0].id;
    bId = (await admin.query('insert into artisans ("userId","nomEntreprise",email) values ($1,$2,$3) returning id', [UB, "Connect Test B", "b@test.fr"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("startOnboarding crée un compte Stripe et renvoie une URL (idempotent au 2e appel)", async () => {
    const result = await startOnboarding(deps, ctx(aId));
    expect(result.url).toMatch(/connect\.stripe\.test\/onboarding\/acct_fake/);
    expect(stripe.connectAccounts).toHaveLength(1);
    expect(stripe.connectAccounts[0]).toMatchObject({ country: "FR", email: "a@test.fr" });

    /* 2e appel : pas de 2e compte créé (idempotent) */
    const result2 = await startOnboarding(deps, ctx(aId));
    expect(result2.url).toMatch(/connect\.stripe\.test/);
    expect(stripe.connectAccounts).toHaveLength(1);
    expect(stripe.accountLinks).toHaveLength(2);
  });

  it("status reflète l'état écrit par startOnboarding (charges_enabled=false, status=pending)", async () => {
    const status = await getConnectStatus(deps, ctx(aId));
    expect(status.status).toBe("pending");
    expect(status.chargesEnabled).toBe(false);
    expect(status.detailsSubmitted).toBe(false);
    expect(status.accountId).toMatch(/^acct_fake_/);
  });

  it("status de l'artisan B reste none (pas de fuite cross-tenant)", async () => {
    const status = await getConnectStatus(deps, ctx(bId));
    expect(status.status).toBe("none");
    expect(status.accountId).toBeNull();
  });

  it("status reflète charges_enabled=true après mise à jour owner", async () => {
    await admin.query(
      `UPDATE artisans SET stripe_connect_charges_enabled=true, stripe_connect_status='active' WHERE id=$1`,
      [aId],
    );
    const status = await getConnectStatus(deps, ctx(aId));
    expect(status.status).toBe("active");
    expect(status.chargesEnabled).toBe(true);
  });
});

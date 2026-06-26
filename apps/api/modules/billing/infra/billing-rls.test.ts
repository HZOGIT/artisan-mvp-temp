import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db/client";
import { BillingRepositoryDrizzle } from "./billing-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 997801;
const B = 997802;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

/**
 * Tests RLS billing par-table (OPE-645) :
 *
 * - billing_subscriptions : HORS RLS (DISABLE) — findSubscriptionById scheduler/webhook
 *   fonctionne sans session tenant. Isolation assurée par scope artisan_id explicite.
 *
 * - billing_payment_methods : RLS tenant actif — accès UI via withTenant uniquement.
 *   Un INSERT sans app.tenant → 42501. Isolation cross-tenant vérifiée.
 */
describe.skipIf(!URL)("billing RLS par-table (OPE-645)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new BillingRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query(
      "update billing_subscriptions set status='trialing', payment_method_id=null where artisan_id in ($1,$2)",
      [A, B],
    );
    await admin.query("delete from billing_subscriptions where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from billing_payment_methods where artisan_id in ($1,$2)", [A, B]);
  };

  afterAll(async () => {
    await cleanup().catch(() => {});
    await app.close();
    await admin.end();
  });

  /* ── billing_subscriptions : HORS RLS ─────────────────────────────────────── */

  it("findSubscriptionById : retourne la ligne via app_tenant SANS poser app.tenant (chemin scheduler/webhook)", async () => {
    await cleanup();
    const sub = await repo.saveSubscription({
      artisanId: A,
      planId: "starter",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
      paymentMethodId: null,
    });
    /* Chemin scheduler/webhook — pas de contexte tenant, lecture par PK */
    const found = await repo.findSubscriptionById(sub.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(sub.id);
    expect(found?.artisan_id).toBe(A);
  });

  it("billing_subscriptions : scope explicite artisan_id — isolation cross-tenant sans RLS", async () => {
    await repo.saveSubscription({
      artisanId: B,
      planId: "pro",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
      paymentMethodId: null,
    });
    const subA = await repo.findSubscription(ctx(A));
    const subB = await repo.findSubscription(ctx(B));
    expect(subA?.artisan_id).toBe(A);
    expect(subB?.artisan_id).toBe(B);
    expect(subA?.artisan_id).not.toBe(B);
  });

  /* ── billing_payment_methods : RLS tenant actif ────────────────────────────── */

  it("savePaymentMethod via withTenant ne lève pas 42501 (INSERT avec app.tenant posé)", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_rls_test",
      stripePaymentMethodId: "pm_rls_test",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      consentedAt: new Date(),
    });
    expect(pm.id).toBeGreaterThan(0);
    expect(pm.artisan_id).toBe(A);
  });

  it("listPaymentMethods : RLS tenant — chaque tenant ne voit que ses propres PM", async () => {
    await repo.savePaymentMethod({
      artisanId: B,
      stripeCustomerId: "cus_rls_b",
      stripePaymentMethodId: "pm_rls_b",
      brand: "mastercard",
      last4: "1234",
      expMonth: 6,
      expYear: 2028,
      consentedAt: new Date(),
    });
    const listA = await repo.listPaymentMethods(ctx(A));
    const listB = await repo.listPaymentMethods(ctx(B));
    expect(listA.every((p) => p.artisan_id === A)).toBe(true);
    expect(listB.every((p) => p.artisan_id === B)).toBe(true);
    expect(listA.some((p) => p.artisan_id === B)).toBe(false);
  });

  it("INSERT billing_payment_methods sans app.tenant → 42501 (RLS CHECK actif)", async () => {
    const appPool = new Pool({ connectionString: APP_URL });
    try {
      await appPool.query(
        "insert into billing_payment_methods (artisan_id, stripe_customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consented_at) values ($1,$2,$3,$4,$5,$6,$7,$8,now())",
        [A, "cus_bare", "pm_bare", "visa", "0000", 1, 2099, false],
      );
      expect.fail("devait lever 42501 (RLS CHECK sans app.tenant)");
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("42501");
    } finally {
      await appPool.end();
    }
  });
});

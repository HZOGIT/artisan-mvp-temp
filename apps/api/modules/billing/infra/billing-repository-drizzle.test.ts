import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { BillingRepositoryDrizzle } from "./billing-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Artisans fictifs dédiés à ces tests (hors plage des fixtures normales).
const A = 997901;
const B = 997902;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

// ⚠️ Les tables billing_* sont HORS RLS → scope EXPLICITE par artisan_id dans le repo.
// Ce test vérifie que le scope est bien appliqué (isolation cross-tenant) via app_tenant.
describe.skipIf(!URL)("BillingRepositoryDrizzle (PG, scope explicite artisan_id)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new BillingRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from billing_payment_methods where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from billing_subscriptions where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from billing_events where entity_type='artisan' and entity_id in ($1,$2)", [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  // ── Moyens de paiement ────────────────────────────────────────────────────

  it("savePaymentMethod + listPaymentMethods scopé au tenant", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_drizzle_test",
      stripePaymentMethodId: "pm_drizzle_test",
      brand: "visa",
      last4: "1234",
      expMonth: 12,
      expYear: 2028,
      consentedAt: new Date(),
    });
    expect(pm.id).toBeGreaterThan(0);
    expect(pm.artisan_id).toBe(A);
    expect(pm.last4).toBe("1234");

    const list = await repo.listPaymentMethods(ctx(A));
    expect(list.some((p) => p.id === pm.id)).toBe(true);

    // Tenant B ne voit pas la carte de A
    const listB = await repo.listPaymentMethods(ctx(B));
    expect(listB.some((p) => p.id === pm.id)).toBe(false);
  });

  it("setDefaultPaymentMethod + findDefaultPaymentMethod", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_drizzle_test2",
      stripePaymentMethodId: "pm_drizzle_def",
      brand: "mastercard",
      last4: "5678",
      expMonth: 6,
      expYear: 2027,
      consentedAt: new Date(),
    });
    await repo.setDefaultPaymentMethod(ctx(A), pm.id);
    const def = await repo.findDefaultPaymentMethod(ctx(A));
    expect(def?.id).toBe(pm.id);

    // Tenant B n'a pas de défaut
    expect(await repo.findDefaultPaymentMethod(ctx(B))).toBeNull();
  });

  it("revokePaymentMethod → disparaît de listPaymentMethods", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_revoke",
      stripePaymentMethodId: "pm_revoke",
      brand: "visa",
      last4: "9999",
      expMonth: 1,
      expYear: 2026,
      consentedAt: new Date(),
    });
    await repo.revokePaymentMethod(ctx(A), pm.id);
    const list = await repo.listPaymentMethods(ctx(A));
    expect(list.some((p) => p.id === pm.id)).toBe(false);
  });

  it("findPaymentMethodById : A peut lire sa carte, B ne la voit pas", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_find",
      stripePaymentMethodId: "pm_find",
      brand: "amex",
      last4: "0001",
      expMonth: 3,
      expYear: 2029,
      consentedAt: new Date(),
    });
    expect((await repo.findPaymentMethodById(ctx(A), pm.id))?.id).toBe(pm.id);
    expect(await repo.findPaymentMethodById(ctx(B), pm.id)).toBeNull();
  });

  // ── Abonnements ──────────────────────────────────────────────────────────

  it("saveSubscription + findSubscription scopé au tenant", async () => {
    const sub = await repo.saveSubscription({
      artisanId: A,
      planId: "starter",
      billingMode: "maison",
      status: "active",
      currentPeriodStart: new Date("2026-06-01"),
      currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null,
      paymentMethodId: null,
    });
    expect(sub.artisan_id).toBe(A);
    expect((await repo.findSubscription(ctx(A)))?.id).toBe(sub.id);
    expect(await repo.findSubscription(ctx(B))).toBeNull();
  });

  // ── Stripe customer ID ────────────────────────────────────────────────────

  it("saveStripeCustomerId + findStripeCustomerId", async () => {
    await repo.saveStripeCustomerId(A, "cus_stored");
    expect(await repo.findStripeCustomerId(A)).toBe("cus_stored");
    expect(await repo.findStripeCustomerId(B)).toBeNull();
  });

  // ── Événements (append-only) ──────────────────────────────────────────────

  it("appendEvent persiste et est retrouvable", async () => {
    const ev = await repo.appendEvent({
      entityType: "artisan",
      entityId: A,
      eventType: "payment_method.confirmed",
      payload: { pm: "pm_test" },
      actor: "user:1",
    });
    expect(ev.id).toBeGreaterThan(0);
    expect(ev.event_type).toBe("payment_method.confirmed");
    expect(ev.actor).toBe("user:1");
  });
});

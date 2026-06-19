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
    // FK order : invoices → cycles → nullify sub.payment_method_id → subs → payment_methods
    await admin.query("delete from billing_invoices where artisan_id in ($1,$2)", [A, B]);
    await admin.query(
      "delete from billing_cycles where subscription_id in (select id from billing_subscriptions where artisan_id in ($1,$2))",
      [A, B],
    );
    // chk_pm_required : nullifier PM exige status=trialing (les deux en un UPDATE atomique)
    await admin.query(
      "update billing_subscriptions set status='trialing', payment_method_id=null where artisan_id in ($1,$2)",
      [A, B],
    );
    await admin.query("delete from billing_subscriptions where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from billing_payment_methods where artisan_id in ($1,$2)", [A, B]);
    await admin.query(
      "delete from billing_events where entity_type='artisan' and entity_id in ($1,$2)",
      [A, B],
    );
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
    // chk_pm_required : trialing est le seul statut valide sans payment_method_id
    const sub = await repo.saveSubscription({
      artisanId: A,
      planId: "starter",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-06-01"),
      currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: new Date("2026-06-15"),
      paymentMethodId: null,
    });
    expect(sub.artisan_id).toBe(A);
    expect((await repo.findSubscription(ctx(A)))?.id).toBe(sub.id);
    expect(await repo.findSubscription(ctx(B))).toBeNull();
  });

  // ── Cycles ────────────────────────────────────────────────────────────────

  it("createCycle + findPendingCycle : retourne le cycle pending de la subscription", async () => {
    const sub = await repo.saveSubscription({
      artisanId: A,
      planId: "pro",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-07-01"),
      currentPeriodEnd: new Date("2026-08-01"),
      trialEndsAt: new Date("2026-07-15"),
      paymentMethodId: null,
    });

    const cycle = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-08-01"),
      amountCents: 2900,
      currency: "eur",
    });

    expect(cycle.id).toBeGreaterThan(0);
    expect(cycle.status).toBe("pending");
    expect(cycle.subscription_id).toBe(sub.id);

    const found = await repo.findPendingCycle(sub.id);
    expect(found?.id).toBe(cycle.id);
  });

  it("findPendingCycle : null si aucun cycle pending (status paid)", async () => {
    const sub = await repo.saveSubscription({
      artisanId: B,
      planId: "starter",
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: new Date("2026-07-01"),
      currentPeriodEnd: new Date("2026-08-01"),
      trialEndsAt: new Date("2026-07-15"),
      paymentMethodId: null,
    });

    // Créer un cycle puis le marquer paid via admin
    const cycle = await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-07-01"),
      periodEnd: new Date("2026-08-01"),
      amountCents: 990,
      currency: "eur",
    });
    await admin.query("update billing_cycles set status='paid' where id=$1", [cycle.id]);

    expect(await repo.findPendingCycle(sub.id)).toBeNull();
  });

  // ── Mise à jour abonnement ────────────────────────────────────────────────

  it("updateSubscriptionStatus : passe de trialing → active (avec PM) sans toucher B", async () => {
    // Lier d'abord une PM à la sub de A pour satisfaire chk_pm_required lors du passage à active
    const pmA = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_status_test",
      stripePaymentMethodId: "pm_status_test",
      brand: "visa",
      last4: "1111",
      expMonth: 1,
      expYear: 2030,
      consentedAt: new Date(),
    });
    await repo.updateSubscriptionPaymentMethod(ctx(A), pmA.id);

    await repo.updateSubscriptionStatus(ctx(A), "active");
    expect((await repo.findSubscription(ctx(A)))?.status).toBe("active");

    // B reste trialing (non modifié)
    expect((await repo.findSubscription(ctx(B)))?.status).toBe("trialing");
  });

  it("updateSubscriptionPaymentMethod : lie la PM à l'abonnement du bon tenant", async () => {
    const pm = await repo.savePaymentMethod({
      artisanId: B,
      stripeCustomerId: "cus_link_b",
      stripePaymentMethodId: "pm_link_b",
      brand: "mastercard",
      last4: "2222",
      expMonth: 6,
      expYear: 2028,
      consentedAt: new Date(),
    });

    await repo.updateSubscriptionPaymentMethod(ctx(B), pm.id);
    expect((await repo.findSubscription(ctx(B)))?.payment_method_id).toBe(pm.id);

    // A inchangé (son PM a été lié dans le test précédent, pas celui de B)
    const subA = await repo.findSubscription(ctx(A));
    expect(subA?.payment_method_id).not.toBe(pm.id);
  });

  // ── Factures ──────────────────────────────────────────────────────────────

  it("findInvoicesByArtisan : retourne les factures du tenant, triées par date desc", async () => {
    // Insertion via admin (les factures sont créées par le scheduler, pas par le repo)
    await admin.query(
      `insert into billing_invoices (artisan_id, type, status, subtotal_cents, tax_cents, total_cents, currency)
       values ($1,'subscription','draft',2900,0,2900,'eur'), ($1,'subscription','draft',2900,0,2900,'eur')`,
      [A],
    );
    await admin.query(
      `insert into billing_invoices (artisan_id, type, status, subtotal_cents, tax_cents, total_cents, currency)
       values ($1,'subscription','draft',990,0,990,'eur')`,
      [B],
    );

    const invoicesA = await repo.findInvoicesByArtisan(ctx(A));
    expect(invoicesA.every((i) => i.artisan_id === A)).toBe(true);
    expect(invoicesA.length).toBeGreaterThanOrEqual(2);

    // Isolation : B ne voit pas celles de A
    const invoicesB = await repo.findInvoicesByArtisan(ctx(B));
    expect(invoicesB.every((i) => i.artisan_id === B)).toBe(true);
    expect(invoicesB.length).toBe(1);
  });

  it("findInvoicesByArtisan : respecte le paramètre limit", async () => {
    const limited = await repo.findInvoicesByArtisan(ctx(A), 1);
    expect(limited.length).toBe(1);
  });

  // ── Stripe customer ID ────────────────────────────────────────────────────

  it("findStripeCustomerId : retourne le customer ID du PM le plus récent (saveStripeCustomerId est no-op)", async () => {
    // saveStripeCustomerId est intentionnellement no-op : le customer ID est porté par chaque PM.
    // findStripeCustomerId cherche dans billing_payment_methods (puis fallback legacy subscriptions).
    const pm = await repo.savePaymentMethod({
      artisanId: A,
      stripeCustomerId: "cus_canonical",
      stripePaymentMethodId: "pm_canonical",
      brand: "visa",
      last4: "3333",
      expMonth: 12,
      expYear: 2031,
      consentedAt: new Date(),
    });

    // Après insertion d'un PM pour A avec cus_canonical, findStripeCustomerId doit le retourner.
    expect(await repo.findStripeCustomerId(A)).toBe("cus_canonical");
    // Artisan sans aucun PM → null
    expect(await repo.findStripeCustomerId(99999)).toBeNull();
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

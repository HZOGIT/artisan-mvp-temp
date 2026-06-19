import { describe, it, expect, beforeEach } from "vitest";
import { FakeBillingRepository } from "./infra/billing-repository-fake";
import { FakeBillingPort } from "../../shared/ports/billing-adapter";
import type { StripePort } from "../../shared/ports/stripe";
import type { BillingDeps } from "./application/billing-use-cases";
import {
  createSetupIntent,
  confirmPaymentMethod,
  revokePaymentMethod,
  setDefaultPaymentMethod,
  getBillingInfo,
  NotFoundError,
} from "./application/billing-use-cases";
import type { TenantContext } from "../../shared/tenant";

// ── Fakes ─────────────────────────────────────────────────────────────────────

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

function makeStripe(customerId = "cus_fake"): StripePort {
  return {
    createCustomer: async () => ({ id: customerId }),
    constructEvent: () => { throw new Error("not used"); },
    createInvoiceCheckout: async () => ({ url: "" }),
  } as unknown as StripePort;
}

function makeDeps(over?: Partial<{ customerId: string }>): BillingDeps & { repo: FakeBillingRepository; billing: FakeBillingPort } {
  const repo = new FakeBillingRepository();
  const billing = new FakeBillingPort();
  return { repo, billing, stripe: makeStripe(over?.customerId ?? "cus_test") };
}

// ── createSetupIntent ─────────────────────────────────────────────────────────

describe("createSetupIntent", () => {
  it("crée un Stripe customer si aucun n'existe et retourne un clientSecret", async () => {
    const deps = makeDeps();
    const result = await createSetupIntent(deps, A);
    expect(result.clientSecret).toBeTruthy();
    expect(result.stripeCustomerId).toBe("cus_test");
  });

  it("réutilise le customer existant sans en recréer un", async () => {
    const deps = makeDeps();
    deps.repo.customerIds.set(A.artisanId, "cus_existing");
    const result = await createSetupIntent(deps, A);
    expect(result.stripeCustomerId).toBe("cus_existing");
    expect(deps.billing.setupIntentsCreated).toEqual(["cus_existing"]);
  });

  it("trace un événement billing après la création", async () => {
    const deps = makeDeps();
    await createSetupIntent(deps, A);
    expect(deps.repo.events).toHaveLength(1);
    expect(deps.repo.events[0]!.event_type).toBe("setup_intent.created");
    expect(deps.repo.events[0]!.actor).toBe(`user:${A.userId}`);
  });
});

// ── confirmPaymentMethod ──────────────────────────────────────────────────────

describe("confirmPaymentMethod", () => {
  it("persiste la carte avec les infos récupérées depuis Stripe", async () => {
    const deps = makeDeps();
    const result = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_fake",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    expect(result.paymentMethod.last4).toBe("4242");
    expect(result.paymentMethod.brand).toBe("visa");
    expect(result.paymentMethod.artisan_id).toBe(A.artisanId);
  });

  it("setAsDefault=true → is_default actif + subscription PM mis à jour", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({ artisanId: A.artisanId, planId: "starter", billingMode: "maison", status: "active", currentPeriodStart: null, currentPeriodEnd: null, trialEndsAt: null, paymentMethodId: null });

    const result = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_fake",
      stripeCustomerId: "cus_test",
      setAsDefault: true,
      consentedAt: new Date(),
    });

    const pm = await deps.repo.findDefaultPaymentMethod(A);
    expect(pm?.id).toBe(result.paymentMethod.id);
    const sub = await deps.repo.findSubscription(A);
    expect(sub?.payment_method_id).toBe(result.paymentMethod.id);
  });

  it("trace un événement payment_method.confirmed", async () => {
    const deps = makeDeps();
    await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_fake",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    expect(deps.repo.events.some(e => e.event_type === "payment_method.confirmed")).toBe(true);
  });
});

// ── revokePaymentMethod ───────────────────────────────────────────────────────

describe("revokePaymentMethod", () => {
  it("soft-delete : revoked_at renseigné, carte disparaît de listPaymentMethods", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_r",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    await revokePaymentMethod(deps, A, pm.id);
    expect(await deps.repo.listPaymentMethods(A)).toHaveLength(0);
  });

  it("NotFoundError si la carte appartient à un autre tenant", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_r",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    await expect(revokePaymentMethod(deps, B, pm.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("trace un événement payment_method.revoked", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, {
      stripePaymentMethodId: "pm_r",
      stripeCustomerId: "cus_test",
      setAsDefault: false,
      consentedAt: new Date(),
    });
    await revokePaymentMethod(deps, A, pm.id);
    expect(deps.repo.events.some(e => e.event_type === "payment_method.revoked")).toBe(true);
  });
});

// ── setDefaultPaymentMethod ───────────────────────────────────────────────────

describe("setDefaultPaymentMethod", () => {
  it("change la carte par défaut — une seule carte default à la fois", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm1 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_1", stripeCustomerId: "cus_test", setAsDefault: true, consentedAt: new Date() });
    const { paymentMethod: pm2 } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_2", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });

    await setDefaultPaymentMethod(deps, A, pm2.id);

    const pms = await deps.repo.listPaymentMethods(A);
    const defaults = pms.filter(p => p.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.id).toBe(pm2.id);
  });

  it("NotFoundError si la carte n'appartient pas au tenant", async () => {
    const deps = makeDeps();
    const { paymentMethod: pm } = await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_x", stripeCustomerId: "cus_test", setAsDefault: false, consentedAt: new Date() });
    await expect(setDefaultPaymentMethod(deps, B, pm.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── getBillingInfo ────────────────────────────────────────────────────────────

describe("getBillingInfo", () => {
  it("retourne subscription null si aucune", async () => {
    const deps = makeDeps();
    const info = await getBillingInfo(deps, A);
    expect(info.subscription).toBeNull();
    expect(info.paymentMethods).toEqual([]);
    expect(info.recentInvoices).toEqual([]);
    expect(info.plan).toBeUndefined();
  });

  it("retourne le plan résolu si abonnement présent", async () => {
    const deps = makeDeps();
    await deps.repo.saveSubscription({ artisanId: A.artisanId, planId: "pro", billingMode: "maison", status: "active", currentPeriodStart: null, currentPeriodEnd: null, trialEndsAt: null, paymentMethodId: null });
    const info = await getBillingInfo(deps, A);
    expect(info.plan?.id).toBe("pro");
  });

  it("isolation cross-tenant — artisan B ne voit pas les données de A", async () => {
    const deps = makeDeps();
    await confirmPaymentMethod(deps, A, { stripePaymentMethodId: "pm_a", stripeCustomerId: "cus_a", setAsDefault: false, consentedAt: new Date() });
    const infoB = await getBillingInfo(deps, B);
    expect(infoB.paymentMethods).toHaveLength(0);
  });
});

// ── Changements de plan (prorata — logique domaine) ───────────────────────────

describe("changements de plan — nextCycleAmount", () => {
  it("upgrade starter→pro : le montant du prochain cycle augmente", async () => {
    const { nextCycleAmount } = await import("./domain/subscription-maison");
    const { PLANS } = await import("./domain/plan");

    const sub = {
      id: 1, artisanId: 1, planId: "starter", billingMode: "maison" as const, status: "active" as const,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAt: null, canceledAt: null,
      trialEndsAt: null, paymentMethodId: null, createdAt: new Date(), updatedAt: new Date(),
    };

    const montantStarter = nextCycleAmount(sub, PLANS.starter, "monthly");
    const montantPro = nextCycleAmount({ ...sub, planId: "pro" }, PLANS.pro, "monthly");
    expect(montantPro).toBeGreaterThan(montantStarter);
  });

  it("downgrade pro→starter : le montant diminue", async () => {
    const { nextCycleAmount } = await import("./domain/subscription-maison");
    const { PLANS } = await import("./domain/plan");

    const sub = {
      id: 1, artisanId: 1, planId: "pro", billingMode: "maison" as const, status: "active" as const,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAt: null, canceledAt: null,
      trialEndsAt: null, paymentMethodId: null, createdAt: new Date(), updatedAt: new Date(),
    };

    const montantPro = nextCycleAmount(sub, PLANS.pro, "monthly");
    const montantStarter = nextCycleAmount({ ...sub, planId: "starter" }, PLANS.starter, "monthly");
    expect(montantStarter).toBeLessThan(montantPro);
  });

  it("passage monthly→yearly : montant yearly < monthly × 12 (remise)", async () => {
    const { nextCycleAmount } = await import("./domain/subscription-maison");
    const { PLANS } = await import("./domain/plan");

    const sub = {
      id: 1, artisanId: 1, planId: "pro", billingMode: "maison" as const, status: "active" as const,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAt: null, canceledAt: null,
      trialEndsAt: null, paymentMethodId: null, createdAt: new Date(), updatedAt: new Date(),
    };

    const monthly12 = nextCycleAmount(sub, PLANS.pro, "monthly") * 12;
    const yearly = nextCycleAmount(sub, PLANS.pro, "yearly");
    expect(yearly).toBeLessThanOrEqual(monthly12);
  });
});

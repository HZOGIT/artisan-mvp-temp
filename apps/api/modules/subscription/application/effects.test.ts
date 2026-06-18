import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import { FakeStripePort } from "../../../shared/ports/stripe-adapter";
import type { TenantContext } from "../../../shared/tenant";
import { FakeSubscriptionReader } from "../infra/subscription-reader-fake";
import type { SubscriptionRow } from "../domain/subscription";
import { ValidationError } from "../../../shared/errors";
import { cancelSubscription, createCheckout, createPortal, reactivateSubscription } from "./use-cases";
import type { SubscriptionPrices } from "../domain/subscription";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({ id: 1, artisanId: 1, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", stripePriceId: null, plan: "pro", status: "active", trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, maxUsers: 5, maxDevicesPerUser: 3, maxConcurrentSessions: 2, ...over });

const PRICES: SubscriptionPrices = {
  essentiel: { month: "price_ess_m", year: "price_ess_y" },
  pro: { month: "price_pro_m", year: "price_pro_y" },
  entreprise: { month: "price_ent_m", year: "price_ent_y" },
  extra: { pro: { month: "price_xpro_m", year: "price_xpro_y" }, entreprise: { month: "price_xent_m", year: "price_xent_y" } },
};

function deps() {
  const repo = new FakeSubscriptionReader();
  const stripe = new FakeStripePort();
  return { repo, stripe, d: { repo, stripe, prices: PRICES, appUrl: "https://app.test" } };
}

describe("subscription effets Stripe (cancel/reactivate)", () => {
  it("cancel : effet Stripe cancel_at_period_end=true PUIS miroir en base", async () => {
    const { repo, stripe, d } = deps();
    repo.seed(1, sub({}));
    expect(await cancelSubscription(d, ctx(1))).toEqual({ success: true });
    expect(stripe.cancelToggles).toEqual([{ subscriptionId: "sub_1", cancel: true }]);
    expect((await repo.getSubscription(ctx(1)))?.cancelAtPeriodEnd).toBe(true);
  });

  it("reactivate : cancel_at_period_end=false + miroir", async () => {
    const { repo, stripe, d } = deps();
    repo.seed(1, sub({ cancelAtPeriodEnd: true }));
    expect(await reactivateSubscription(d, ctx(1))).toEqual({ success: true });
    expect(stripe.cancelToggles).toEqual([{ subscriptionId: "sub_1", cancel: false }]);
    expect((await repo.getSubscription(ctx(1)))?.cancelAtPeriodEnd).toBe(false);
  });

  it("cancel/reactivate sans abonnement Stripe → NotFoundError (aucun appel Stripe)", async () => {
    const { repo, stripe, d } = deps();
    repo.seed(1, sub({ stripeSubscriptionId: null }));
    await expect(cancelSubscription(d, ctx(1))).rejects.toBeInstanceOf(NotFoundError);
    await expect(reactivateSubscription(d, ctx(1))).rejects.toBeInstanceOf(NotFoundError);
    // Tenant sans aucune ligne → 404 aussi.
    await expect(cancelSubscription(d, ctx(99))).rejects.toBeInstanceOf(NotFoundError);
    expect(stripe.cancelToggles).toEqual([]);
  });

  it("createCheckout : crée le Customer (1re fois, persisté) + session avec line items principal/extra", async () => {
    const { repo, stripe, d } = deps();
    repo.setNomEntreprise(1, "Plomberie Léa");
    const res = await createCheckout(d, ctx(1), "lea@t.fr", { plan: "pro", interval: "month", extraUsers: 2 });
    expect(res.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    // Customer créé avec nom entreprise + metadata artisanId, et persisté.
    expect(stripe.customers[0]).toMatchObject({ email: "lea@t.fr", name: "Plomberie Léa", metadata: { artisanId: "1" } });
    expect((await repo.getSubscription(ctx(1)))?.stripeCustomerId).toBe("cus_fake_1");
    // Line items : prix principal + utilisateurs supplémentaires (plan pro).
    const co = stripe.checkouts[0];
    expect(co.lineItems).toEqual([{ price: "price_pro_m", quantity: 1 }, { price: "price_xpro_m", quantity: 2 }]);
    expect(co.trialPeriodDays).toBe(30);
    expect(co.successUrl).toContain("/parametres?tab=abonnement&success=1");
  });

  it("createCheckout : Customer déjà existant → réutilisé (pas de createCustomer) ; essentiel ignore extraUsers", async () => {
    const { repo, stripe, d } = deps();
    repo.seed(1, sub({ stripeCustomerId: "cus_existing" }));
    await createCheckout(d, ctx(1), "x@t.fr", { plan: "essentiel", interval: "year", extraUsers: 5 });
    expect(stripe.customers).toHaveLength(0); // pas de nouveau customer
    expect(stripe.checkouts[0].customerId).toBe("cus_existing");
    expect(stripe.checkouts[0].lineItems).toEqual([{ price: "price_ess_y", quantity: 1 }]); // pas d'extra sur essentiel
  });

  it("createCheckout : price ID manquant pour le couple plan/intervalle → ValidationError (aucun effet)", async () => {
    const stripe = new FakeStripePort();
    const repo = new FakeSubscriptionReader();
    const d = { repo, stripe, prices: { ...PRICES, pro: { month: undefined, year: undefined } }, appUrl: "https://app.test" };
    await expect(createCheckout(d, ctx(1), "x@t.fr", { plan: "pro", interval: "month", extraUsers: 0 })).rejects.toBeInstanceOf(ValidationError);
    expect(stripe.customers).toEqual([]);
    expect(stripe.checkouts).toEqual([]);
  });

  it("createPortal : Customer présent → URL portail ; absent → NotFoundError", async () => {
    const { repo, stripe, d } = deps();
    repo.seed(1, sub({ stripeCustomerId: "cus_1" }));
    expect((await createPortal(d, ctx(1))).url).toMatch(/^https:\/\/billing\.stripe\.test\//);
    expect(stripe.portals[0]).toMatchObject({ customerId: "cus_1", returnUrl: "https://app.test/parametres?tab=abonnement" });
    repo.seed(2, sub({ stripeCustomerId: null }));
    await expect(createPortal(d, ctx(2))).rejects.toBeInstanceOf(NotFoundError);
  });
});

import { describe, it, expect } from "vitest";
import { NotFoundError } from "../../../shared/errors";
import { FakeStripePort } from "../../../shared/ports/stripe-adapter";
import type { TenantContext } from "../../../shared/tenant";
import { FakeSubscriptionReader } from "../infra/subscription-reader-fake";
import type { SubscriptionRow } from "../domain/subscription";
import { cancelSubscription, reactivateSubscription } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({ id: 1, artisanId: 1, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", stripePriceId: null, plan: "pro", status: "active", trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, maxUsers: 5, maxDevicesPerUser: 3, maxConcurrentSessions: 2, ...over });

function deps() {
  const repo = new FakeSubscriptionReader();
  const stripe = new FakeStripePort();
  return { repo, stripe, d: { repo, stripe, appUrl: "https://app.test" } };
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
});

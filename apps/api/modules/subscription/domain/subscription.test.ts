import { describe, it, expect } from "vitest";
import { computeCurrentSubscription } from "./subscription";
import type { SubscriptionRow } from "./subscription";

const NOW = new Date("2026-06-15T12:00:00Z");
const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: 1,
  artisanId: 10,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripePriceId: null,
  plan: "trial",
  status: "trialing",
  trialEndsAt: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  maxUsers: 1,
  maxDevicesPerUser: 3,
  maxConcurrentSessions: 2,
  ...over,
});

describe("computeCurrentSubscription (pur)", () => {
  it("aucune ligne → défauts trial/trialing, quotas 1/3/2, pas en essai (trialEndsAt null)", () => {
    expect(computeCurrentSubscription(null, NOW)).toEqual({
      plan: "trial",
      status: "trialing",
      isTrialing: false,
      trialDaysLeft: 0,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      maxUsers: 1,
      maxDevicesPerUser: 3,
      maxConcurrentSessions: 2,
      stripeSubscriptionId: null,
    });
  });

  it("essai en cours : isTrialing=true + jours restants (arrondi sup)", () => {
    const cur = computeCurrentSubscription(sub({ status: "trialing", trialEndsAt: new Date("2026-06-20T18:00:00Z") }), NOW);
    expect(cur.isTrialing).toBe(true);
    expect(cur.trialDaysLeft).toBe(6); // ~5.25 j → ceil 6
  });

  it("essai expiré : isTrialing=false, trialDaysLeft=0 (plancher)", () => {
    const cur = computeCurrentSubscription(sub({ status: "trialing", trialEndsAt: new Date("2026-06-10T00:00:00Z") }), NOW);
    expect(cur.isTrialing).toBe(false);
    expect(cur.trialDaysLeft).toBe(0);
  });

  it("abonnement payé : statut/quotas/stripe repris ; isTrialing=false même si trialEndsAt futur", () => {
    const cur = computeCurrentSubscription(
      sub({ plan: "pro", status: "active", trialEndsAt: new Date("2026-07-01"), currentPeriodEnd: new Date("2026-07-15"), cancelAtPeriodEnd: true, maxUsers: 5, stripeSubscriptionId: "sub_123" }),
      NOW,
    );
    expect(cur).toMatchObject({ plan: "pro", status: "active", isTrialing: false, cancelAtPeriodEnd: true, maxUsers: 5, stripeSubscriptionId: "sub_123" });
    expect(cur.currentPeriodEnd).toEqual(new Date("2026-07-15"));
  });
});

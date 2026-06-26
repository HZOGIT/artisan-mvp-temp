import { describe, it, expect } from "vitest";
import { computeCurrentSubscription } from "./subscription";
import type { SubscriptionRow } from "./subscription";

const NOW = new Date("2026-06-15T12:00:00Z");
const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: 1,
  artisanId: 10,
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
  it("aucune ligne → essai 14j actif (non bloquant) avec trialEndsAt calculé sur now", () => {
    const result = computeCurrentSubscription(null, NOW);
    expect(result).toMatchObject({ plan: "trial", status: "trialing", isTrialing: true, trialDaysLeft: 14, currentPeriodEnd: null, cancelAtPeriodEnd: false, maxUsers: 1, maxDevicesPerUser: 3, maxConcurrentSessions: 2 });
    expect(result.trialEndsAt).toEqual(new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000));
  });

  it("essai en cours : isTrialing=true + jours restants (arrondi sup)", () => {
    const cur = computeCurrentSubscription(sub({ status: "trialing", trialEndsAt: new Date("2026-06-20T18:00:00Z") }), NOW);
    expect(cur.isTrialing).toBe(true);
    expect(cur.trialDaysLeft).toBe(6);
  });

  it("essai expiré : isTrialing=false, trialDaysLeft=0 (plancher)", () => {
    const cur = computeCurrentSubscription(sub({ status: "trialing", trialEndsAt: new Date("2026-06-10T00:00:00Z") }), NOW);
    expect(cur.isTrialing).toBe(false);
    expect(cur.trialDaysLeft).toBe(0);
  });

  it("abonnement payé : statut/quotas repris ; isTrialing=false même si trialEndsAt futur", () => {
    const cur = computeCurrentSubscription(
      sub({ plan: "pro", status: "active", trialEndsAt: new Date("2026-07-01"), currentPeriodEnd: new Date("2026-07-15"), cancelAtPeriodEnd: true, maxUsers: 5 }),
      NOW,
    );
    expect(cur).toMatchObject({ plan: "pro", status: "active", isTrialing: false, cancelAtPeriodEnd: true, maxUsers: 5 });
    expect(cur.currentPeriodEnd).toEqual(new Date("2026-07-15"));
  });
});

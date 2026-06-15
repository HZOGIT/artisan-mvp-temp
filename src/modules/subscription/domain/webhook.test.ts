import { describe, it, expect } from "vitest";
import { planFromMetadata, artisanIdFromMetadata, computeInternalStatus, mapSubscriptionUpsert, deletedUpsertFields, PLAN_LIMITS } from "./webhook";

describe("webhook domain (pur)", () => {
  it("planFromMetadata : plan connu → {plan, extraUsers} ; inconnu → null", () => {
    expect(planFromMetadata({ plan: "PRO", extraUsers: "2" })).toEqual({ plan: "pro", extraUsers: 2 });
    expect(planFromMetadata({ plan: "inconnu" })).toBeNull();
    expect(planFromMetadata(undefined)).toBeNull();
  });

  it("artisanIdFromMetadata : entier >0 sinon null", () => {
    expect(artisanIdFromMetadata({ artisanId: "42" })).toBe(42);
    expect(artisanIdFromMetadata({ artisanId: "0" })).toBeNull();
    expect(artisanIdFromMetadata({})).toBeNull();
  });

  it("computeInternalStatus : mapping legacy", () => {
    expect(computeInternalStatus("trialing")).toBe("trialing");
    expect(computeInternalStatus("past_due")).toBe("past_due");
    expect(computeInternalStatus("canceled")).toBe("canceled");
    expect(computeInternalStatus("incomplete_expired")).toBe("canceled");
    expect(computeInternalStatus("active")).toBe("active");
    expect(computeInternalStatus("autre")).toBe("active");
  });

  it("mapSubscriptionUpsert : champs + limites (pro + 2 extra) + dates epoch", () => {
    const f = mapSubscriptionUpsert({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      metadata: { plan: "pro", extraUsers: "2", artisanId: "7" },
      items: { data: [{ price: { id: "price_pro" } }] },
      trial_end: 1_700_000_000,
      current_period_start: 1_700_000_100,
      current_period_end: 1_702_000_000,
      cancel_at_period_end: true,
    });
    expect(f.stripeCustomerId).toBe("cus_1");
    expect(f.stripeSubscriptionId).toBe("sub_1");
    expect(f.stripePriceId).toBe("price_pro");
    expect(f.plan).toBe("pro");
    expect(f.status).toBe("active");
    expect(f.maxUsers).toBe(PLAN_LIMITS.pro.maxUsers + 2); // 3 + 2
    expect(f.maxConcurrentSessions).toBe(PLAN_LIMITS.pro.maxSessions);
    expect(f.cancelAtPeriodEnd).toBe(true);
    expect(f.currentPeriodEnd?.getTime()).toBe(1_702_000_000 * 1000);
  });

  it("mapSubscriptionUpsert : plan absent → trial + limites trial", () => {
    const f = mapSubscriptionUpsert({ id: "sub_x", customer: "cus_x", status: "trialing", metadata: {} });
    expect(f.plan).toBe("trial");
    expect(f.status).toBe("trialing");
    expect(f.maxUsers).toBe(PLAN_LIMITS.trial.maxUsers);
    expect(f.trialEndsAt).toBeNull();
  });

  it("deletedUpsertFields : expired/canceled", () => {
    expect(deletedUpsertFields()).toEqual({ plan: "expired", status: "canceled", cancelAtPeriodEnd: false });
  });
});

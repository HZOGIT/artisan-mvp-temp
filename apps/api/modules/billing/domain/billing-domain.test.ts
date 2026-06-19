import { describe, it, expect } from "vitest";
import { planById, planLimits, PLANS } from "./plan";
import { isZombie, isDue, nextRetryAt } from "./billing-cycle";
import { isActive, isCancelable, nextCycleAmount } from "./subscription-maison";
import type { BillingCycle } from "./billing-cycle";
import type { SubscriptionMaison } from "./subscription-maison";

// ── Plan ─────────────────────────────────────────────────────────────────────

describe("plan — fonctions pures", () => {
  it("planById retourne le plan pour un id valide", () => {
    expect(planById("starter")?.id).toBe("starter");
    expect(planById("pro")?.id).toBe("pro");
  });

  it("planById retourne undefined pour un id inconnu", () => {
    expect(planById("inexistant")).toBeUndefined();
  });

  it("planLimits retourne des limites cohérentes (starter < pro < enterprise)", () => {
    const s = planLimits("starter");
    const p = planLimits("pro");
    const e = planLimits("enterprise");
    expect(s.maxUsers).toBeLessThan(p.maxUsers);
    expect(p.maxUsers).toBeLessThan(e.maxUsers);
  });

  it("amountCentsByInterval : yearly < monthly × 12 (remise annuelle)", () => {
    for (const plan of Object.values(PLANS)) {
      const monthly12 = plan.amountCentsByInterval.monthly * 12;
      expect(plan.amountCentsByInterval.yearly).toBeLessThanOrEqual(monthly12);
    }
  });
});

// ── BillingCycle — fonctions pures ────────────────────────────────────────────

const baseCycle = (over: Partial<BillingCycle> = {}): BillingCycle => ({
  id: 1,
  subscriptionId: 10,
  periodStart: new Date("2026-06-01"),
  periodEnd: new Date("2026-07-01"),
  amountCents: 2900,
  currency: "eur",
  status: "pending",
  chargingStartedAt: null,
  attemptCount: 0,
  nextRetryAt: null,
  paidAt: null,
  failedAt: null,
  createdAt: new Date("2026-06-01"),
  updatedAt: new Date("2026-06-01"),
  ...over,
});

describe("isZombie", () => {
  it("false si status !== charging", () => {
    const now = new Date();
    expect(isZombie(baseCycle({ status: "pending" }), now)).toBe(false);
    expect(isZombie(baseCycle({ status: "paid" }), now)).toBe(false);
  });

  it("false si charging mais < 15 min", () => {
    const started = new Date();
    const now = new Date(started.getTime() + 14 * 60 * 1000);
    expect(isZombie(baseCycle({ status: "charging", chargingStartedAt: started }), now)).toBe(false);
  });

  it("true si charging depuis > 15 min", () => {
    const started = new Date();
    const now = new Date(started.getTime() + 16 * 60 * 1000);
    expect(isZombie(baseCycle({ status: "charging", chargingStartedAt: started }), now)).toBe(true);
  });

  it("false si charging sans chargingStartedAt (donnée corrompue)", () => {
    expect(isZombie(baseCycle({ status: "charging", chargingStartedAt: null }), new Date())).toBe(false);
  });
});

describe("isDue", () => {
  it("true si status = pending", () => {
    expect(isDue(baseCycle({ status: "pending" }), new Date())).toBe(true);
  });

  it("false si paid/charging/requires_action", () => {
    const now = new Date();
    expect(isDue(baseCycle({ status: "paid" }), now)).toBe(false);
    expect(isDue(baseCycle({ status: "charging" }), now)).toBe(false);
    expect(isDue(baseCycle({ status: "requires_action" }), now)).toBe(false);
  });

  it("true si failed et nextRetryAt échu", () => {
    const past = new Date(Date.now() - 1000);
    expect(isDue(baseCycle({ status: "failed", nextRetryAt: past }), new Date())).toBe(true);
  });

  it("false si failed mais nextRetryAt dans le futur", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isDue(baseCycle({ status: "failed", nextRetryAt: future }), new Date())).toBe(false);
  });

  it("false si failed sans nextRetryAt (abandon définitif)", () => {
    expect(isDue(baseCycle({ status: "failed", nextRetryAt: null }), new Date())).toBe(false);
  });
});

describe("nextRetryAt — plan de dunning J+0/J+1/J+3/J+7", () => {
  const failedAt = new Date("2026-06-01T12:00:00Z");

  it("attempt 0 → retry immédiat (délai 0)", () => {
    expect(nextRetryAt(failedAt, 0)?.getTime()).toBe(failedAt.getTime());
  });

  it("attempt 1 → J+1", () => {
    const expected = new Date(failedAt.getTime() + 24 * 3_600_000);
    expect(nextRetryAt(failedAt, 1)?.getTime()).toBe(expected.getTime());
  });

  it("attempt 2 → J+3", () => {
    const expected = new Date(failedAt.getTime() + 3 * 24 * 3_600_000);
    expect(nextRetryAt(failedAt, 2)?.getTime()).toBe(expected.getTime());
  });

  it("attempt 3+ → J+7 (plafond)", () => {
    const expected = new Date(failedAt.getTime() + 7 * 24 * 3_600_000);
    expect(nextRetryAt(failedAt, 3)?.getTime()).toBe(expected.getTime());
    expect(nextRetryAt(failedAt, 99)?.getTime()).toBe(expected.getTime());
  });
});

// ── SubscriptionMaison — fonctions pures ──────────────────────────────────────

const baseSub = (over: Partial<SubscriptionMaison> = {}): SubscriptionMaison => ({
  id: 1,
  artisanId: 1,
  planId: "starter",
  billingMode: "maison",
  status: "active",
  currentPeriodStart: new Date("2026-06-01"),
  currentPeriodEnd: new Date("2026-07-01"),
  cancelAt: null,
  canceledAt: null,
  trialEndsAt: null,
  paymentMethodId: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("isActive", () => {
  it("true pour active / trialing / past_due", () => {
    expect(isActive(baseSub({ status: "active" }))).toBe(true);
    expect(isActive(baseSub({ status: "trialing" }))).toBe(true);
    expect(isActive(baseSub({ status: "past_due" }))).toBe(true);
  });

  it("false pour canceled", () => {
    expect(isActive(baseSub({ status: "canceled" }))).toBe(false);
  });
});

describe("isCancelable", () => {
  it("true si non canceled", () => {
    expect(isCancelable(baseSub({ status: "active" }))).toBe(true);
    expect(isCancelable(baseSub({ status: "past_due" }))).toBe(true);
  });

  it("false si déjà canceled", () => {
    expect(isCancelable(baseSub({ status: "canceled" }))).toBe(false);
  });
});

describe("nextCycleAmount", () => {
  const pro = PLANS.pro;

  it("0 si status = trialing (pas de prélèvement pendant l'essai)", () => {
    expect(nextCycleAmount(baseSub({ status: "trialing" }), pro, "monthly")).toBe(0);
  });

  it("montant mensuel du plan si active", () => {
    expect(nextCycleAmount(baseSub(), pro, "monthly")).toBe(pro.amountCentsByInterval.monthly);
  });

  it("montant annuel si interval yearly", () => {
    expect(nextCycleAmount(baseSub(), pro, "yearly")).toBe(pro.amountCentsByInterval.yearly);
  });

  it("yearly < monthly × 12 (cohérence remise)", () => {
    const yearly = nextCycleAmount(baseSub(), pro, "yearly");
    const monthly12 = nextCycleAmount(baseSub(), pro, "monthly") * 12;
    expect(yearly).toBeLessThanOrEqual(monthly12);
  });
});

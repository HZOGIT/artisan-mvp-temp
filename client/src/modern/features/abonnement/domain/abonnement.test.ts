import { describe, expect, it } from "vitest";
import {
  PLANS, calcPrice, isCurrentPlan, trialColorTier, trialProgressPct, planLabel, relativeTime,
  type Subscription, type PlanDef,
} from "./abonnement";

const sub = (p: Partial<Subscription>): Subscription => ({ plan: "pro", status: "active", ...p } as unknown as Subscription);
const pro = PLANS.find((p) => p.id === "pro") as PlanDef;

describe("PLANS", () => {
  it("3 plans, annuel = mensuel × 12 × 0.8", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["essentiel", "pro", "entreprise"]);
    expect(pro.yearly).toBeCloseTo(49 * 12 * 0.8);
  });
});

describe("calcPrice", () => {
  it("mensuel sans extra = base", () => {
    expect(calcPrice(pro, 0, "month")).toBe(49);
  });
  it("mensuel + 2 users supp = base + 2×10", () => {
    expect(calcPrice(pro, 2, "month")).toBe(49 + 20);
  });
  it("annuel + extra annualisé -20%", () => {
    expect(calcPrice(pro, 1, "year")).toBeCloseTo(49 * 12 * 0.8 + 1 * 10 * 12 * 0.8);
  });
});

describe("isCurrentPlan", () => {
  it("vrai si même plan ET ni expiré ni résilié", () => {
    expect(isCurrentPlan(sub({ plan: "pro", status: "active" }), "pro")).toBe(true);
    expect(isCurrentPlan(sub({ plan: "pro", status: "trialing" }), "pro")).toBe(true);
    expect(isCurrentPlan(sub({ plan: "pro", status: "canceled" }), "pro")).toBe(false);
    expect(isCurrentPlan(sub({ plan: "pro", status: "expired" }), "pro")).toBe(false);
    expect(isCurrentPlan(sub({ plan: "pro" }), "essentiel")).toBe(false);
  });
});

describe("trialColorTier / trialProgressPct", () => {
  it("tiers d'essai", () => {
    expect(trialColorTier(0)).toBe("danger");
    expect(trialColorTier(1)).toBe("danger");
    expect(trialColorTier(3)).toBe("warning");
    expect(trialColorTier(10)).toBe("normal");
  });
  it("progression bornée 0-100", () => {
    expect(trialProgressPct(30)).toBe(100);
    expect(trialProgressPct(15)).toBe(50);
    expect(trialProgressPct(-5)).toBe(0);
    expect(trialProgressPct(60)).toBe(100);
  });
});

describe("planLabel / relativeTime", () => {
  it("capitalise le plan", () => {
    expect(planLabel("pro")).toBe("Pro");
    expect(planLabel("entreprise")).toBe("Entreprise");
  });
  it("relativeTime : null → tiret, récent → minutes", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime(new Date(Date.now() - 5 * 60000))).toBe("il y a 5 min");
  });
});

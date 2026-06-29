import { describe, it, expect } from "vitest";
import { isDowngrade, exceedsTargetLimits } from "./plan-change-preview";
import type { PlanChangePreviewData } from "./plan-change-preview";

const base: PlanChangePreviewData = {
  currentPlanId: "pro",
  targetPlanId: "starter",
  targetAmountCents: 2900,
  nextBillingDate: null,
  immediateAmountCents: 0,
  activeUserCount: 1,
  targetMaxUsers: 1,
};

describe("isDowngrade", () => {
  it("pro → starter = downgrade", () => expect(isDowngrade("pro", "starter")).toBe(true));
  it("starter → pro = pas downgrade", () => expect(isDowngrade("starter", "pro")).toBe(false));
  it("starter → enterprise = pas downgrade", () => expect(isDowngrade("starter", "enterprise")).toBe(false));
  it("enterprise → pro = downgrade", () => expect(isDowngrade("enterprise", "pro")).toBe(true));
  it("même plan = pas downgrade", () => expect(isDowngrade("pro", "pro")).toBe(false));
  it("plan inconnu = false (graceful)", () => expect(isDowngrade("unknown", "starter")).toBe(false));
});

describe("exceedsTargetLimits", () => {
  it("1 user, limite 1 → pas dépassé", () => expect(exceedsTargetLimits({ ...base, activeUserCount: 1, targetMaxUsers: 1 })).toBe(false));
  it("2 users, limite 1 → dépassé", () => expect(exceedsTargetLimits({ ...base, activeUserCount: 2, targetMaxUsers: 1 })).toBe(true));
  it("5 users, limite 5 → pas dépassé", () => expect(exceedsTargetLimits({ ...base, activeUserCount: 5, targetMaxUsers: 5 })).toBe(false));
  it("6 users, limite 5 → dépassé", () => expect(exceedsTargetLimits({ ...base, activeUserCount: 6, targetMaxUsers: 5 })).toBe(true));
});

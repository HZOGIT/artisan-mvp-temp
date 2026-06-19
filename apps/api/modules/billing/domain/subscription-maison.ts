import type { BillingInterval, Plan, PlanId } from "./plan";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface SubscriptionMaison {
  readonly id: number;
  readonly artisanId: number;
  readonly planId: PlanId;
  readonly billingMode: "maison" | "stripe";
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAt: Date | null;
  readonly canceledAt: Date | null;
  readonly trialEndsAt: Date | null;
  readonly paymentMethodId: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function isActive(sub: SubscriptionMaison): boolean {
  return sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
}

export function isCancelable(sub: SubscriptionMaison): boolean {
  return sub.status !== "canceled";
}

export function nextCycleAmount(sub: SubscriptionMaison, plan: Plan, interval: BillingInterval = "monthly"): number {
  if (sub.status === "trialing") return 0;
  return plan.amountCentsByInterval[interval];
}

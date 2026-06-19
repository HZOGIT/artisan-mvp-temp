export type PlanId = "starter" | "pro" | "enterprise";

export type BillingInterval = "monthly" | "yearly";

export interface Plan {
  readonly id: PlanId;
  readonly name: string;
  readonly amountCentsByInterval: Record<BillingInterval, number>;
  readonly maxUsers: number;
  readonly maxDevicesPerUser: number;
  readonly maxConcurrentSessions: number;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    amountCentsByInterval: { monthly: 2900, yearly: 29000 },
    maxUsers: 1,
    maxDevicesPerUser: 2,
    maxConcurrentSessions: 1,
  },
  pro: {
    id: "pro",
    name: "Pro",
    amountCentsByInterval: { monthly: 4900, yearly: 49000 },
    maxUsers: 5,
    maxDevicesPerUser: 3,
    maxConcurrentSessions: 3,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    amountCentsByInterval: { monthly: 9900, yearly: 99000 },
    maxUsers: 999,
    maxDevicesPerUser: 10,
    maxConcurrentSessions: 10,
  },
};

export function planById(id: string): Plan | undefined {
  return PLANS[id as PlanId];
}

export function planLimits(id: PlanId) {
  const p = PLANS[id];
  return { maxUsers: p.maxUsers, maxDevicesPerUser: p.maxDevicesPerUser, maxConcurrentSessions: p.maxConcurrentSessions };
}

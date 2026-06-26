const DAY_MS = 24 * 60 * 60 * 1000;

/** Ligne brute d'abonnement (billing maison via `billing_subscriptions`). */
export interface SubscriptionRow {
  readonly id: number;
  readonly artisanId: number;
  readonly plan: string;
  readonly status: string;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly maxUsers: number;
  readonly maxDevicesPerUser: number;
  readonly maxConcurrentSessions: number;
}

/** Sortie de `getCurrent` (statut + quotas + essai calculé). Forme exacte attendue par le client. */
export interface CurrentSubscription {
  readonly plan: string;
  readonly status: string;
  readonly isTrialing: boolean;
  readonly trialDaysLeft: number;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly maxUsers: number;
  readonly maxDevicesPerUser: number;
  readonly maxConcurrentSessions: number;
}

export function computeCurrentSubscription(sub: SubscriptionRow | null, now: Date): CurrentSubscription {
  if (!sub) {
    const trialEndsAt = new Date(now.getTime() + 14 * DAY_MS);
    return { plan: "trial", status: "trialing", isTrialing: true, trialDaysLeft: 14, trialEndsAt, currentPeriodEnd: null, cancelAtPeriodEnd: false, maxUsers: 1, maxDevicesPerUser: 3, maxConcurrentSessions: 2 };
  }
  const trialEndsAt = sub.trialEndsAt;
  const isTrialing = sub.status === "trialing" && trialEndsAt !== null && trialEndsAt > now;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS)) : 0;
  return {
    plan: sub.plan,
    status: sub.status,
    isTrialing,
    trialDaysLeft,
    trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    maxUsers: sub.maxUsers,
    maxDevicesPerUser: sub.maxDevicesPerUser,
    maxConcurrentSessions: sub.maxConcurrentSessions,
  };
}

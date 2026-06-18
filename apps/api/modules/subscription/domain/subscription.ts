// Abonnement SaaS (table `subscriptions`, HORS RLS — clé `artisan_id`). Billing Stripe (essai 14 j puis
// plans Essentiel/Pro/Entreprise). Ce module commence par la LECTURE (`getCurrent`) ; les effets Stripe
// (checkout/portal/cancel/reactivate) + le webhook signé viennent ensuite.

// Ligne brute d'abonnement (camelCase ; mappée depuis les colonnes snake_case par le reader).
export interface SubscriptionRow {
  readonly id: number;
  readonly artisanId: number;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
  readonly stripePriceId: string | null;
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

// Sortie de `getCurrent` (statut + quotas + essai calculé). Forme exacte attendue par le client.
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
  readonly stripeSubscriptionId: string | null;
}

export type SubscriptionPlan = "essentiel" | "pro" | "entreprise";
export type SubscriptionInterval = "month" | "year";

// Price IDs Stripe par plan/intervalle (depuis l'env legacy `STRIPE_PRICE_*`). `extra` = price IDs des
// utilisateurs supplémentaires (plans pro/entreprise uniquement).
export interface PlanPriceIds {
  readonly month?: string;
  readonly year?: string;
}
export interface SubscriptionPrices {
  readonly essentiel: PlanPriceIds;
  readonly pro: PlanPriceIds;
  readonly entreprise: PlanPriceIds;
  readonly extra: { readonly pro: PlanPriceIds; readonly entreprise: PlanPriceIds };
}

// Price ID des utilisateurs supplémentaires pour un plan donné (undefined pour essentiel). PURE.
export function extraPriceId(prices: SubscriptionPrices, plan: SubscriptionPlan, interval: SubscriptionInterval): string | undefined {
  if (plan === "essentiel") return undefined;
  return prices.extra[plan]?.[interval];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Calcule l'état d'abonnement courant (parité legacy `subscription.getCurrent`, branche « artisan
// présent »). PURE. `isTrialing` = statut trialing ET essai dans le futur ; `trialDaysLeft` = jours
// restants (arrondi sup, plancher 0). Défauts (aucune ligne) : trial/trialing, quotas 1/3/2.
export function computeCurrentSubscription(sub: SubscriptionRow | null, now: Date): CurrentSubscription {
  const trialEndsAt = sub?.trialEndsAt ?? null;
  const isTrialing = sub?.status === "trialing" && trialEndsAt !== null && trialEndsAt > now;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS)) : 0;
  return {
    plan: sub?.plan ?? "trial",
    status: sub?.status ?? "trialing",
    isTrialing,
    trialDaysLeft,
    trialEndsAt,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(sub?.cancelAtPeriodEnd),
    maxUsers: sub?.maxUsers ?? 1,
    maxDevicesPerUser: sub?.maxDevicesPerUser ?? 3,
    maxConcurrentSessions: sub?.maxConcurrentSessions ?? 2,
    stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
  };
}

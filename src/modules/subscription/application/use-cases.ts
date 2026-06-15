import { NotFoundError } from "../../../shared/errors";
import type { StripePort } from "../../../shared/ports/stripe";
import type { TenantContext } from "../../../shared/tenant";
import { computeCurrentSubscription } from "../domain/subscription";
import type { CurrentSubscription } from "../domain/subscription";
import type { ISubscriptionReader, ISubscriptionRepository } from "./subscription-reader";

// Dépendances des effets billing (Stripe + repo + URLs). `appUrl` = base de confiance des redirections.
export interface SubscriptionEffectDeps {
  readonly repo: ISubscriptionRepository;
  readonly stripe: StripePort;
  readonly appUrl: string;
}

// État d'abonnement courant du tenant (essai/quotas calculés). `now` injectable pour le déterminisme.
export async function getCurrent(reader: ISubscriptionReader, ctx: TenantContext, now: () => Date = () => new Date()): Promise<CurrentSubscription> {
  return computeCurrentSubscription(await reader.getSubscription(ctx), now());
}

// Annule l'abonnement en fin de période (convention Stripe `cancel_at_period_end`). Aucun abonnement
// Stripe → 404 (parité legacy). Effet Stripe PUIS miroir en base.
export async function cancelSubscription(deps: SubscriptionEffectDeps, ctx: TenantContext): Promise<{ success: true }> {
  const sub = await deps.repo.getSubscription(ctx);
  if (!sub?.stripeSubscriptionId) throw new NotFoundError("Aucun abonnement actif");
  await deps.stripe.setCancelAtPeriodEnd(sub.stripeSubscriptionId, true);
  await deps.repo.setCancelAtPeriodEnd(ctx, true);
  return { success: true };
}

// Réactive un abonnement annulé avant la fin de période (`cancel_at_period_end=false`).
export async function reactivateSubscription(deps: SubscriptionEffectDeps, ctx: TenantContext): Promise<{ success: true }> {
  const sub = await deps.repo.getSubscription(ctx);
  if (!sub?.stripeSubscriptionId) throw new NotFoundError("Aucun abonnement trouve");
  await deps.stripe.setCancelAtPeriodEnd(sub.stripeSubscriptionId, false);
  await deps.repo.setCancelAtPeriodEnd(ctx, false);
  return { success: true };
}

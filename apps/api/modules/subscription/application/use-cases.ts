import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { StripeLineItem, StripePort } from "../../../shared/ports/stripe";
import type { TenantContext } from "../../../shared/tenant";
import { computeCurrentSubscription, extraPriceId } from "../domain/subscription";
import type { CurrentSubscription, SubscriptionInterval, SubscriptionPlan, SubscriptionPrices } from "../domain/subscription";
import type { ISubscriptionReader, ISubscriptionRepository } from "./subscription-reader";

/** Dépendances des effets billing (Stripe + repo + prix + URLs). `appUrl` = base de confiance des redirections. */
export interface SubscriptionEffectDeps {
  readonly repo: ISubscriptionRepository;
  readonly stripe: StripePort;
  readonly prices: SubscriptionPrices;
  readonly appUrl: string;
}

export interface CheckoutInput {
  readonly plan: SubscriptionPlan;
  readonly interval: SubscriptionInterval;
  readonly extraUsers: number;
}

/** État d'abonnement courant du tenant (essai/quotas calculés). `now` injectable pour le déterminisme. */
export async function getCurrent(reader: ISubscriptionReader, ctx: TenantContext, now: () => Date = () => new Date()): Promise<CurrentSubscription> {
  return computeCurrentSubscription(await reader.getSubscription(ctx), now());
}

/*
 * Crée une session Stripe Checkout (souscription). Récupère/crée le Customer Stripe (persisté), construit
 * les line items (principal + utilisateurs supplémentaires), session en essai 30 j. Price ID manquant
 * pour le couple plan/intervalle → 400 (parité legacy PRECONDITION_FAILED). `email` = email du tenant.
 */
export async function createCheckout(deps: SubscriptionEffectDeps, ctx: TenantContext, email: string | undefined, input: CheckoutInput): Promise<{ url: string | null }> {
  const mainPriceId = deps.prices[input.plan]?.[input.interval];
  if (!mainPriceId) {
    throw new ValidationError(`Prix Stripe non configure pour ${input.plan} ${input.interval}.`);
  }
  const sub = await deps.repo.getSubscription(ctx);
  let customerId = sub?.stripeCustomerId ?? null;
  if (!customerId) {
    const nomEntreprise = await deps.repo.getNomEntreprise(ctx);
    const customer = await deps.stripe.createCustomer({ email, name: nomEntreprise || email || `Artisan ${ctx.artisanId}`, metadata: { artisanId: String(ctx.artisanId) } });
    customerId = customer.id;
    await deps.repo.setStripeCustomerId(ctx, customerId);
  }
  const lineItems: StripeLineItem[] = [{ price: mainPriceId, quantity: 1 }];
  if (input.extraUsers > 0 && input.plan !== "essentiel") {
    const extra = extraPriceId(deps.prices, input.plan, input.interval);
    if (extra) lineItems.push({ price: extra, quantity: input.extraUsers });
  }
  const session = await deps.stripe.createCheckoutSession({
    customerId,
    lineItems,
    trialPeriodDays: 30,
    subscriptionMetadata: { artisanId: String(ctx.artisanId), plan: input.plan, extraUsers: String(input.extraUsers) },
    successUrl: `${deps.appUrl}/parametres?tab=abonnement&success=1`,
    cancelUrl: `${deps.appUrl}/parametres?tab=abonnement&canceled=1`,
    metadata: { artisanId: String(ctx.artisanId), plan: input.plan },
  });
  return { url: session.url };
}

/** Crée une session du portail de facturation Stripe (gérer carte/factures). Aucun Customer → 404. */
export async function createPortal(deps: SubscriptionEffectDeps, ctx: TenantContext): Promise<{ url: string | null }> {
  const sub = await deps.repo.getSubscription(ctx);
  if (!sub?.stripeCustomerId) throw new NotFoundError("Aucun abonnement actif trouve");
  const session = await deps.stripe.createBillingPortalSession({ customerId: sub.stripeCustomerId, returnUrl: `${deps.appUrl}/parametres?tab=abonnement` });
  return { url: session.url };
}

/*
 * Annule l'abonnement en fin de période (convention Stripe `cancel_at_period_end`). Aucun abonnement
 * Stripe → 404 (parité legacy). Effet Stripe PUIS miroir en base.
 */
export async function cancelSubscription(deps: SubscriptionEffectDeps, ctx: TenantContext): Promise<{ success: true }> {
  const sub = await deps.repo.getSubscription(ctx);
  if (!sub?.stripeSubscriptionId) throw new NotFoundError("Aucun abonnement actif");
  await deps.stripe.setCancelAtPeriodEnd(sub.stripeSubscriptionId, true);
  await deps.repo.setCancelAtPeriodEnd(ctx, true);
  return { success: true };
}

/** Réactive un abonnement annulé avant la fin de période (`cancel_at_period_end=false`). */
export async function reactivateSubscription(deps: SubscriptionEffectDeps, ctx: TenantContext): Promise<{ success: true }> {
  const sub = await deps.repo.getSubscription(ctx);
  if (!sub?.stripeSubscriptionId) throw new NotFoundError("Aucun abonnement trouve");
  await deps.stripe.setCancelAtPeriodEnd(sub.stripeSubscriptionId, false);
  await deps.repo.setCancelAtPeriodEnd(ctx, false);
  return { success: true };
}

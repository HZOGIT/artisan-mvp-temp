import type { TenantContext } from "../../../shared/tenant";
import type { IBillingRepository } from "./billing-repository";
import type { BillingPort } from "../../../shared/ports/billing";
import type { StripePort } from "../../../shared/ports/stripe";
import type { BillingPaymentMethod, BillingSubscription, BillingInvoice } from "../../../../../drizzle/schema.pg";
import { planById } from "../domain/plan";

export interface BillingDeps {
  readonly repo: IBillingRepository;
  readonly billing: BillingPort;
  readonly stripe: StripePort;
}


export interface CreateSetupIntentResult {
  readonly clientSecret: string;
  readonly setupIntentId: string;
  readonly stripeCustomerId: string;
}

/** Étape 1 : crée (ou réutilise) le Stripe customer et retourne un SetupIntent clientSecret. */
export async function createSetupIntent(deps: BillingDeps, ctx: TenantContext): Promise<CreateSetupIntentResult> {
  let customerId = await deps.repo.findStripeCustomerId(ctx.artisanId);

  if (!customerId) {
    const customer = await deps.stripe.createCustomer({ name: `artisan-${ctx.artisanId}`, metadata: { artisan_id: String(ctx.artisanId) } });
    customerId = customer.id;
  }

  const result = await deps.billing.createSetupIntent(customerId);
  await deps.repo.appendEvent({
    entityType: "artisan",
    entityId: ctx.artisanId,
    eventType: "setup_intent.created",
    payload: { setupIntentId: result.setupIntentId, stripeCustomerId: customerId },
    actor: `user:${ctx.userId}`,
  });

  return { ...result, stripeCustomerId: customerId };
}


export interface ConfirmPaymentMethodParams {
  readonly stripePaymentMethodId: string;
  readonly stripeCustomerId: string;
  readonly setAsDefault: boolean;
  readonly consentedAt: Date;
}

export interface ConfirmPaymentMethodResult {
  readonly paymentMethod: BillingPaymentMethod;
}

/** Étape 2 : après confirmation Stripe Elements, récupère les infos PM et les persiste. */
export async function confirmPaymentMethod(
  deps: BillingDeps,
  ctx: TenantContext,
  params: ConfirmPaymentMethodParams,
): Promise<ConfirmPaymentMethodResult> {
  const pmInfo = await deps.billing.retrievePaymentMethod(params.stripePaymentMethodId);

  const pm = await deps.repo.savePaymentMethod({
    artisanId: ctx.artisanId,
    stripeCustomerId: params.stripeCustomerId,
    stripePaymentMethodId: params.stripePaymentMethodId,
    brand: pmInfo.brand,
    last4: pmInfo.last4,
    expMonth: pmInfo.expMonth,
    expYear: pmInfo.expYear,
    consentedAt: params.consentedAt,
  });

  if (params.setAsDefault) {
    await deps.repo.setDefaultPaymentMethod(ctx, pm.id);
    const sub = await deps.repo.findSubscription(ctx);
    if (sub) {
      await deps.repo.updateSubscriptionPaymentMethod(ctx, pm.id);
    }
    await resumeBillingIfAbandoned(deps.repo, ctx);
  }

  await deps.repo.appendEvent({
    entityType: "billing_payment_method",
    entityId: pm.id,
    eventType: "payment_method.confirmed",
    payload: { artisanId: ctx.artisanId, brand: pm.brand, last4: pm.last4, isDefault: params.setAsDefault },
    actor: `user:${ctx.userId}`,
  });

  return { paymentMethod: params.setAsDefault ? { ...pm, is_default: true } : pm };
}


export async function revokePaymentMethod(deps: BillingDeps, ctx: TenantContext, paymentMethodId: number): Promise<void> {
  const pm = await deps.repo.findPaymentMethodById(ctx, paymentMethodId);
  if (!pm) throw new NotFoundError(`Moyen de paiement ${paymentMethodId} introuvable`);

  await deps.repo.revokePaymentMethod(ctx, paymentMethodId);
  await deps.repo.appendEvent({
    entityType: "billing_payment_method",
    entityId: paymentMethodId,
    eventType: "payment_method.revoked",
    payload: { artisanId: ctx.artisanId, last4: pm.last4, brand: pm.brand },
    actor: `user:${ctx.userId}`,
  });
}


export interface BillingInfo {
  readonly subscription: BillingSubscription | null;
  readonly paymentMethods: BillingPaymentMethod[];
  readonly recentInvoices: BillingInvoice[];
  readonly plan: ReturnType<typeof planById> | undefined;
}

export async function getBillingInfo(deps: Pick<BillingDeps, "repo">, ctx: TenantContext): Promise<BillingInfo> {
  const [subscription, paymentMethods, recentInvoices] = await Promise.all([
    deps.repo.findSubscription(ctx),
    deps.repo.listPaymentMethods(ctx),
    deps.repo.findInvoicesByArtisan(ctx, 12),
  ]);

  const plan = subscription ? planById(subscription.plan_id) : undefined;
  return { subscription, paymentMethods, recentInvoices, plan };
}


async function resumeBillingIfAbandoned(repo: IBillingRepository, ctx: TenantContext): Promise<void> {
  const sub = await repo.findSubscription(ctx);
  if (!sub || sub.status !== "past_due") return;

  const abandoned = await repo.findAbandonedCycle(sub.id);
  if (!abandoned) return;

  /*
   * attempt_count intentionnellement NON réinitialisé à 0.
   * billing_charge_attempts a une contrainte UNIQUE sur (cycle_id, attempt_no) :
   * remettre attempt_count=0 provoquerait une violation de clé unique au prochain
   * createChargeAttempt (attempt_no=1 déjà pris par la première tentative de dunning).
   * Les nouvelles tentatives post-reprise continuent depuis le compteur courant
   * (ex. attempt_no=5 après un dunning complet à 4 tentatives).
   */
  await repo.updateCycleStatus(abandoned.id, {
    status: "pending",
    nextRetryAt: null,
    failedAt: null,
  });
  await repo.updateSubscriptionStatus(ctx, "active");
  await repo.appendEvent({
    entityType: "billing_subscription",
    entityId: sub.id,
    eventType: "subscription.billing_resumed",
    payload: { artisanId: sub.artisan_id, cycleId: abandoned.id, reason: "payment_method_updated" },
    actor: `user:${ctx.userId}`,
  });
}

export async function setDefaultPaymentMethod(deps: BillingDeps, ctx: TenantContext, paymentMethodId: number): Promise<void> {
  const pm = await deps.repo.findPaymentMethodById(ctx, paymentMethodId);
  if (!pm) throw new NotFoundError(`Moyen de paiement ${paymentMethodId} introuvable`);

  await deps.repo.setDefaultPaymentMethod(ctx, paymentMethodId);
  const sub = await deps.repo.findSubscription(ctx);
  if (sub) await deps.repo.updateSubscriptionPaymentMethod(ctx, paymentMethodId);

  await resumeBillingIfAbandoned(deps.repo, ctx);

  await deps.repo.appendEvent({
    entityType: "billing_payment_method",
    entityId: paymentMethodId,
    eventType: "payment_method.set_default",
    payload: { artisanId: ctx.artisanId, last4: pm.last4 },
    actor: `user:${ctx.userId}`,
  });
}


export class InvalidPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlanError";
  }
}

export async function changePlan(deps: Pick<BillingDeps, "repo">, ctx: TenantContext, newPlanId: string): Promise<void> {
  const knownPlan = planById(newPlanId);
  if (!knownPlan) throw new InvalidPlanError(`Plan inconnu : ${newPlanId}`);

  const sub = await deps.repo.findSubscription(ctx);
  if (!sub) throw new NotFoundError("Aucun abonnement actif");
  if (sub.status === "canceled") return;

  if (sub.plan_id === newPlanId) return;

  await deps.repo.updateSubscriptionPlan(ctx, newPlanId);

  const pendingCycle = await deps.repo.findPendingCycle(sub.id);
  if (pendingCycle) {
    const interval = sub.billing_interval === "yearly" ? "yearly" : "monthly";
    const newAmountCents = knownPlan.amountCentsByInterval[interval];
    await deps.repo.updateCycleAmount(pendingCycle.id, newAmountCents);
  }

  await deps.repo.appendEvent({
    entityType: "billing_subscription",
    entityId: sub.id,
    eventType: "subscription.plan_changed",
    payload: { artisanId: sub.artisan_id, from: sub.plan_id, to: newPlanId, pendingCycleUpdated: !!pendingCycle },
    actor: `user:${ctx.userId}`,
  });
}


export async function cancelAtPeriodEnd(deps: Pick<BillingDeps, "repo">, ctx: TenantContext): Promise<void> {
  const sub = await deps.repo.findSubscription(ctx);
  if (!sub) throw new NotFoundError("Aucun abonnement actif");
  if (sub.status === "canceled") return;
  if (sub.cancel_at !== null) return;

  /*
   * Pour une sub trialing, current_period_end est null (la période de facturation démarre
   * à la fin du trial). On utilise trial_ends_at comme date d'annulation effective, sinon
   * l'annulation serait planifiée à now() et la sub serait annulée immédiatement à l'activation.
   */
  const cancelAt = sub.current_period_end ?? sub.trial_ends_at ?? new Date();
  await deps.repo.updateCancelAt(ctx, cancelAt);
  await deps.repo.appendEvent({
    entityType: "billing_subscription",
    entityId: sub.id,
    eventType: "subscription.cancel_scheduled",
    payload: { artisanId: sub.artisan_id, cancelAt: cancelAt.toISOString() },
    actor: `user:${ctx.userId}`,
  });
}

export async function reactivateSubscription(deps: Pick<BillingDeps, "repo">, ctx: TenantContext): Promise<void> {
  const sub = await deps.repo.findSubscription(ctx);
  if (!sub) throw new NotFoundError("Aucun abonnement actif");
  /*
   * Sub réellement annulée par le scheduler (status=canceled, cancel_at toujours présent) :
   * effacer cancel_at sans remettre status→active laisserait la sub coincée canceled.
   * La réactivation passe par la création d'un nouvel abonnement, pas par ce chemin.
   */
  if (sub.status === "canceled") return;
  if (sub.cancel_at === null) return;

  await deps.repo.updateCancelAt(ctx, null);
  await deps.repo.appendEvent({
    entityType: "billing_subscription",
    entityId: sub.id,
    eventType: "subscription.reactivated",
    payload: { artisanId: sub.artisan_id },
    actor: `user:${ctx.userId}`,
  });
}


export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

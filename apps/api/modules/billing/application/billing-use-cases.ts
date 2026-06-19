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

// ── SetupIntent flow ──────────────────────────────────────────────────────────

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

// ── Confirmation de la carte (post-Stripe Elements) ───────────────────────────

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
  }

  await deps.repo.appendEvent({
    entityType: "billing_payment_method",
    entityId: pm.id,
    eventType: "payment_method.confirmed",
    payload: { brand: pm.brand, last4: pm.last4, isDefault: params.setAsDefault },
    actor: `user:${ctx.userId}`,
  });

  // Reflect the is_default update in the returned object (savePaymentMethod inserts with is_default=false).
  return { paymentMethod: params.setAsDefault ? { ...pm, is_default: true } : pm };
}

// ── Révocation d'une carte ────────────────────────────────────────────────────

export async function revokePaymentMethod(deps: BillingDeps, ctx: TenantContext, paymentMethodId: number): Promise<void> {
  const pm = await deps.repo.findPaymentMethodById(ctx, paymentMethodId);
  if (!pm) throw new NotFoundError(`Moyen de paiement ${paymentMethodId} introuvable`);

  await deps.repo.revokePaymentMethod(ctx, paymentMethodId);
  await deps.repo.appendEvent({
    entityType: "billing_payment_method",
    entityId: paymentMethodId,
    eventType: "payment_method.revoked",
    payload: { last4: pm.last4, brand: pm.brand },
    actor: `user:${ctx.userId}`,
  });
}

// ── Lecture billing info ──────────────────────────────────────────────────────

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

// ── Changement de carte par défaut ────────────────────────────────────────────

export async function setDefaultPaymentMethod(deps: BillingDeps, ctx: TenantContext, paymentMethodId: number): Promise<void> {
  const pm = await deps.repo.findPaymentMethodById(ctx, paymentMethodId);
  if (!pm) throw new NotFoundError(`Moyen de paiement ${paymentMethodId} introuvable`);

  await deps.repo.setDefaultPaymentMethod(ctx, paymentMethodId);
  const sub = await deps.repo.findSubscription(ctx);
  if (sub) await deps.repo.updateSubscriptionPaymentMethod(ctx, paymentMethodId);

  await deps.repo.appendEvent({
    entityType: "billing_payment_method",
    entityId: paymentMethodId,
    eventType: "payment_method.set_default",
    payload: { last4: pm.last4 },
    actor: `user:${ctx.userId}`,
  });
}

// ── Erreurs domaine ───────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

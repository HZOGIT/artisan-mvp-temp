import type { TenantContext } from "../../../shared/tenant";
import type { IBillingRepository } from "./billing-repository";
import type { BillingPort } from "../../../shared/ports/billing";
import type { StripePort } from "../../../shared/ports/stripe";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { StoragePort } from "../../../shared/ports/storage";
import type { DbClient } from "../../../shared/db";
import type { BillingPaymentMethod, BillingSubscription, BillingInvoice } from "../../../../../drizzle/schema.pg";
import { planById } from "../domain/plan";
import type { BillingInterval } from "../domain/plan";
import { OPERIOZ } from "../domain/operioz-config";
import type { FactureAbonnementData } from "../../../shared/pdf/pdf-generator";
import { withOutbox } from "../../../shared/events/with-outbox";

export interface BillingDeps {
  readonly repo: IBillingRepository;
  readonly billing: BillingPort;
  readonly stripe: StripePort;
  readonly pdf?: PdfPort;
  readonly storage?: StoragePort;
  readonly db?: DbClient;
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
  if (pm.revoked_at !== null) return;

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
  if (pm.revoked_at !== null) throw new NotFoundError(`Moyen de paiement ${paymentMethodId} révoqué`);

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

export async function changePlan(
  deps: Pick<BillingDeps, "repo" | "db">,
  ctx: TenantContext,
  newPlanId: string,
  now: Date = new Date(),
): Promise<void> {
  const knownPlan = planById(newPlanId);
  if (!knownPlan) throw new InvalidPlanError(`Plan inconnu : ${newPlanId}`);

  const sub = await deps.repo.findSubscription(ctx);
  if (!sub) throw new NotFoundError("Aucun abonnement actif");
  if (sub.status === "canceled") return;

  if (sub.plan_id === newPlanId) return;

  const oldPlan = planById(sub.plan_id);
  const interval: "monthly" | "yearly" = sub.billing_interval === "yearly" ? "yearly" : "monthly";
  await deps.repo.updateSubscriptionPlan(ctx, newPlanId);
  await deps.repo.deactivateLockedModules(ctx.artisanId, newPlanId);
  await deps.repo.reactivateDefaultModulesForPlan(ctx.artisanId, newPlanId);

  const pendingCycle = await deps.repo.findPendingCycle(sub.id);
  let prorataImmediat = false;
  if (pendingCycle) {
    const newAmountCents = knownPlan.amountCentsByInterval[interval];
    const oldAmountCents = oldPlan ? oldPlan.amountCentsByInterval[interval] : newAmountCents;
    const diff = newAmountCents - oldAmountCents;

    let pendingCycleAmount = newAmountCents;

    if (diff !== 0) {
      const periodLengthMs = pendingCycle.period_end.getTime() - pendingCycle.period_start.getTime();
      const remainingMs = pendingCycle.period_start.getTime() - now.getTime();
      if (remainingMs > 0 && periodLengthMs > 0) {
        const prorationCents = Math.round((remainingMs / periodLengthMs) * Math.abs(diff));
        if (diff > 0 && prorationCents > 0) {
          /* upgrade mi-cycle : charge immédiate pour les jours restants × différentiel */
          prorataImmediat = true;
          await deps.repo.createCycle({
            subscriptionId: sub.id,
            periodStart: now,
            periodEnd: pendingCycle.period_start,
            amountCents: prorationCents,
            currency: pendingCycle.currency,
          });
        } else if (diff < 0 && prorationCents > 0) {
          /* downgrade mi-cycle : crédit proraté déduit du prochain cycle */
          pendingCycleAmount = Math.max(0, newAmountCents - prorationCents);
        }
      }
    }

    await deps.repo.updateCycleAmount(pendingCycle.id, pendingCycleAmount);
  }

  await withOutbox(deps.db, deps.repo, async (r, _tx) => {
    await r.appendEvent({
      entityType: "billing_subscription",
      entityId: sub.id,
      eventType: "subscription.plan_changed",
      payload: { artisanId: sub.artisan_id, from: sub.plan_id, to: newPlanId, pendingCycleUpdated: !!pendingCycle },
      actor: `user:${ctx.userId}`,
    });
    await r.emitOutboxEvent({
      artisanId: ctx.artisanId,
      userId: ctx.userId,
      action: "abonnement.plan_change",
      entityType: "abonnement",
      entityId: sub.id,
      payload: { from: sub.plan_id, to: newPlanId, montantCents: knownPlan.amountCentsByInterval[interval], prorataImmediat, dateEffet: now.toISOString() },
    });
  });
}


export async function cancelAtPeriodEnd(deps: Pick<BillingDeps, "repo" | "db">, ctx: TenantContext): Promise<void> {
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
  await withOutbox(deps.db, deps.repo, async (r, _tx) => {
    await r.updateCancelAt(ctx, cancelAt);
    await r.appendEvent({
      entityType: "billing_subscription",
      entityId: sub.id,
      eventType: "subscription.cancel_scheduled",
      payload: { artisanId: sub.artisan_id, cancelAt: cancelAt.toISOString() },
      actor: `user:${ctx.userId}`,
    });
    await r.emitOutboxEvent({
      artisanId: ctx.artisanId,
      userId: ctx.userId,
      action: "abonnement.annulation_planifiee",
      entityType: "abonnement",
      entityId: sub.id,
      payload: { cancelAt: cancelAt.toISOString() },
    });
  });
}

export async function reactivateSubscription(deps: Pick<BillingDeps, "repo" | "db">, ctx: TenantContext): Promise<void> {
  const sub = await deps.repo.findSubscription(ctx);
  if (!sub) throw new NotFoundError("Aucun abonnement actif");
  /*
   * Sub réellement annulée par le scheduler (status=canceled, cancel_at toujours présent) :
   * effacer cancel_at sans remettre status→active laisserait la sub coincée canceled.
   * La réactivation passe par la création d'un nouvel abonnement, pas par ce chemin.
   */
  if (sub.status === "canceled") return;
  if (sub.cancel_at === null) return;

  await withOutbox(deps.db, deps.repo, async (r, _tx) => {
    await r.updateCancelAt(ctx, null);
    await r.appendEvent({
      entityType: "billing_subscription",
      entityId: sub.id,
      eventType: "subscription.reactivated",
      payload: { artisanId: sub.artisan_id },
      actor: `user:${ctx.userId}`,
    });
    await r.emitOutboxEvent({
      artisanId: ctx.artisanId,
      userId: ctx.userId,
      action: "abonnement.reactivite",
      entityType: "abonnement",
      entityId: sub.id,
      payload: { planId: sub.plan_id },
    });
  });
}


export interface ActivateOnboardingSubscriptionParams {
  readonly planId: "starter" | "pro" | "enterprise";
  readonly paymentMethodId: number;
}

/**
 * Crée un abonnement trialing J+15 à la fin de l'onboarding.
 * Idempotent : retourne l'abonnement existant non-annulé s'il en existe déjà un.
 */
export async function activateOnboardingSubscription(
  deps: Pick<BillingDeps, "repo" | "db">,
  ctx: TenantContext,
  params: ActivateOnboardingSubscriptionParams,
): Promise<{ subscriptionId: number }> {
  const pm = await deps.repo.findPaymentMethodById(ctx, params.paymentMethodId);
  if (!pm) throw new NotFoundError(`Moyen de paiement ${params.paymentMethodId} introuvable`);

  const existing = await deps.repo.findSubscription(ctx);
  if (existing && existing.status !== "canceled") return { subscriptionId: existing.id };

  const trialEndsAt = new Date(Date.now() + 15 * 24 * 3600_000);
  const subscriptionId = await withOutbox(deps.db, deps.repo, async (r, _tx) => {
    const sub = await r.saveSubscription({
      artisanId: ctx.artisanId,
      planId: params.planId,
      billingMode: "maison",
      status: "trialing",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt,
      paymentMethodId: pm.id,
    });
    await r.appendEvent({
      entityType: "billing_subscription",
      entityId: sub.id,
      eventType: "subscription.onboarding_activated",
      payload: { artisanId: ctx.artisanId, planId: params.planId, trialEndsAt: trialEndsAt.toISOString() },
      actor: `user:${ctx.userId}`,
    });
    await r.emitOutboxEvent({
      artisanId: ctx.artisanId,
      userId: ctx.userId,
      action: "abonnement.essai_demarre",
      entityType: "abonnement",
      entityId: sub.id,
      payload: { planId: params.planId, trialEndsAt: trialEndsAt.toISOString() },
    });
    return sub.id;
  });

  return { subscriptionId };
}


export interface PlanChangePreview {
  readonly currentPlanId: string;
  readonly targetPlanId: string;
  readonly targetAmountCents: number;
  readonly nextBillingDate: Date | null;
  readonly immediateAmountCents: number;
  readonly activeUserCount: number;
  readonly targetMaxUsers: number;
}

export async function previewPlanChange(
  deps: Pick<BillingDeps, "repo">,
  ctx: TenantContext,
  newPlanId: string,
  now: Date = new Date(),
): Promise<PlanChangePreview> {
  const knownPlan = planById(newPlanId);
  if (!knownPlan) throw new InvalidPlanError(`Plan inconnu : ${newPlanId}`);

  const sub = await deps.repo.findSubscription(ctx);
  if (!sub) throw new NotFoundError("Aucun abonnement actif");

  const interval: BillingInterval = sub.billing_interval === "yearly" ? "yearly" : "monthly";
  const targetAmountCents = knownPlan.amountCentsByInterval[interval];

  const pendingCycle = await deps.repo.findPendingCycle(sub.id);
  const nextBillingDate: Date | null = pendingCycle?.period_start ?? (sub.status === "trialing" ? sub.trial_ends_at : sub.current_period_end) ?? null;

  let immediateAmountCents = 0;
  if (pendingCycle) {
    const oldPlan = planById(sub.plan_id);
    const oldAmountCents = oldPlan ? oldPlan.amountCentsByInterval[interval] : 0;
    const diff = targetAmountCents - oldAmountCents;
    if (diff > 0) {
      const periodLengthMs = pendingCycle.period_end.getTime() - pendingCycle.period_start.getTime();
      const remainingMs = pendingCycle.period_start.getTime() - now.getTime();
      if (remainingMs > 0 && periodLengthMs > 0) {
        immediateAmountCents = Math.round((remainingMs / periodLengthMs) * diff);
      }
    }
  }

  const activeUserCount = await deps.repo.countActiveUsers(ctx);

  return {
    currentPlanId: sub.plan_id,
    targetPlanId: newPlanId,
    targetAmountCents,
    nextBillingDate,
    immediateAmountCents,
    activeUserCount,
    targetMaxUsers: knownPlan.maxUsers,
  };
}


export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}


export async function downloadSubscriptionInvoice(
  deps: BillingDeps,
  ctx: TenantContext,
  invoiceId: number,
): Promise<{ url: string }> {
  const invoice = await deps.repo.findInvoiceById(ctx, invoiceId);
  if (!invoice) throw new NotFoundError(`Facture ${invoiceId} introuvable`);

  if (invoice.pdf_url) return { url: invoice.pdf_url };

  if (!deps.pdf || !deps.storage) throw new Error("PDF/storage non disponibles");

  const cycle = invoice.billing_cycle_id
    ? await deps.repo.findCycleById(invoice.billing_cycle_id)
    : null;

  const pdfData: FactureAbonnementData = {
    number: invoice.number ?? String(invoice.id),
    date: invoice.paid_at ?? invoice.created_at,
    periodStart: cycle?.period_start ?? invoice.created_at,
    periodEnd: cycle?.period_end ?? invoice.created_at,
    planDescription: "Abonnement Operioz",
    subtotalCents: invoice.subtotal_cents,
    taxCents: invoice.tax_cents,
    totalCents: invoice.total_cents,
    currency: invoice.currency,
    sellerName: invoice.seller_name ?? OPERIOZ.name,
    sellerAddress: invoice.seller_address ?? OPERIOZ.address,
    sellerSiret: invoice.seller_siret ?? OPERIOZ.siret,
    sellerTvaIntracom: invoice.seller_tva_intracom ?? OPERIOZ.tvaIntracom,
    buyerName: invoice.buyer_name ?? "",
    buyerAddress: invoice.buyer_address ?? "",
    buyerSiret: invoice.buyer_siret ?? "",
  };

  const pdfBuf = await deps.pdf.render("facture-abonnement", pdfData as unknown as Record<string, unknown>);
  const key = `billing-invoices/${invoice.artisan_id}/${invoice.id}.pdf`;
  const stored = await deps.storage.upload(key, pdfBuf, {
    contentType: "application/pdf",
    artisanId: invoice.artisan_id,
    filename: `Facture_Operioz_${invoice.number ?? invoice.id}.pdf`,
    purpose: "billing-invoice-pdf",
  });
  const url = await deps.storage.url(stored.storageKey);
  await deps.repo.updateInvoicePdfUrl(invoice.id, url);
  return { url };
}

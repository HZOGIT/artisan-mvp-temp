import { eq, desc, and, isNull } from "drizzle-orm";
import {
  billingPaymentMethods,
  billingSubscriptions,
  billingCycles,
  billingInvoices,
  billingEvents,
  subscriptions,
} from "../../../../../drizzle/schema.pg";
import type { BillingPaymentMethod, BillingSubscription, BillingCycle, BillingInvoice, BillingEvent } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type {
  IBillingRepository,
  SavePaymentMethodParams,
  SaveSubscriptionParams,
  CreateCycleParams,
  AppendEventParams,
} from "../application/billing-repository";

/** ⚠️ Les tables billing_* sont HORS RLS → scope EXPLICITE par artisan_id. */
export class BillingRepositoryDrizzle implements IBillingRepository {
  constructor(private readonly db: DbClient) {}

  // ── Moyens de paiement ────────────────────────────────────────────────────

  async listPaymentMethods(ctx: TenantContext): Promise<BillingPaymentMethod[]> {
    return this.db
      .select()
      .from(billingPaymentMethods)
      .where(and(eq(billingPaymentMethods.artisan_id, ctx.artisanId), isNull(billingPaymentMethods.revoked_at)))
      .orderBy(desc(billingPaymentMethods.is_default), desc(billingPaymentMethods.created_at));
  }

  async findPaymentMethodById(ctx: TenantContext, id: number): Promise<BillingPaymentMethod | null> {
    const [row] = await this.db
      .select()
      .from(billingPaymentMethods)
      .where(and(eq(billingPaymentMethods.id, id), eq(billingPaymentMethods.artisan_id, ctx.artisanId)))
      .limit(1);
    return row ?? null;
  }

  async findDefaultPaymentMethod(ctx: TenantContext): Promise<BillingPaymentMethod | null> {
    const [row] = await this.db
      .select()
      .from(billingPaymentMethods)
      .where(and(eq(billingPaymentMethods.artisan_id, ctx.artisanId), eq(billingPaymentMethods.is_default, true)))
      .limit(1);
    return row ?? null;
  }

  async savePaymentMethod(params: SavePaymentMethodParams): Promise<BillingPaymentMethod> {
    const [row] = await this.db
      .insert(billingPaymentMethods)
      .values({
        artisan_id: params.artisanId,
        stripe_customer_id: params.stripeCustomerId,
        stripe_payment_method_id: params.stripePaymentMethodId,
        brand: params.brand,
        last4: params.last4,
        exp_month: params.expMonth,
        exp_year: params.expYear,
        is_default: false,
        consented_at: params.consentedAt,
      })
      .returning();
    return row!;
  }

  async setDefaultPaymentMethod(ctx: TenantContext, id: number): Promise<void> {
    await this.db
      .update(billingPaymentMethods)
      .set({ is_default: false })
      .where(eq(billingPaymentMethods.artisan_id, ctx.artisanId));
    await this.db
      .update(billingPaymentMethods)
      .set({ is_default: true })
      .where(and(eq(billingPaymentMethods.id, id), eq(billingPaymentMethods.artisan_id, ctx.artisanId)));
  }

  async revokePaymentMethod(ctx: TenantContext, id: number): Promise<void> {
    await this.db
      .update(billingPaymentMethods)
      .set({ is_default: false, revoked_at: new Date() })
      .where(and(eq(billingPaymentMethods.id, id), eq(billingPaymentMethods.artisan_id, ctx.artisanId)));
  }

  // ── Abonnement ────────────────────────────────────────────────────────────

  async findSubscription(ctx: TenantContext): Promise<BillingSubscription | null> {
    const [row] = await this.db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.artisan_id, ctx.artisanId))
      .limit(1);
    return row ?? null;
  }

  async saveSubscription(params: SaveSubscriptionParams): Promise<BillingSubscription> {
    const [row] = await this.db
      .insert(billingSubscriptions)
      .values({
        artisan_id: params.artisanId,
        plan_id: params.planId,
        billing_mode: params.billingMode,
        status: params.status,
        current_period_start: params.currentPeriodStart ?? undefined,
        current_period_end: params.currentPeriodEnd ?? undefined,
        trial_ends_at: params.trialEndsAt ?? undefined,
        payment_method_id: params.paymentMethodId ?? undefined,
      })
      .onConflictDoUpdate({
        target: billingSubscriptions.artisan_id,
        set: {
          plan_id: params.planId,
          billing_mode: params.billingMode,
          status: params.status,
          current_period_start: params.currentPeriodStart ?? undefined,
          current_period_end: params.currentPeriodEnd ?? undefined,
          trial_ends_at: params.trialEndsAt ?? undefined,
          payment_method_id: params.paymentMethodId ?? undefined,
          updated_at: new Date(),
        },
      })
      .returning();
    return row!;
  }

  async updateSubscriptionStatus(ctx: TenantContext, status: string): Promise<void> {
    await this.db
      .update(billingSubscriptions)
      .set({ status, updated_at: new Date() })
      .where(eq(billingSubscriptions.artisan_id, ctx.artisanId));
  }

  async updateSubscriptionPaymentMethod(ctx: TenantContext, paymentMethodId: number): Promise<void> {
    await this.db
      .update(billingSubscriptions)
      .set({ payment_method_id: paymentMethodId, updated_at: new Date() })
      .where(eq(billingSubscriptions.artisan_id, ctx.artisanId));
  }

  // ── Cycles ────────────────────────────────────────────────────────────────

  async findPendingCycle(subscriptionId: number): Promise<BillingCycle | null> {
    const [row] = await this.db
      .select()
      .from(billingCycles)
      .where(and(eq(billingCycles.subscription_id, subscriptionId), eq(billingCycles.status, "pending")))
      .orderBy(desc(billingCycles.period_start))
      .limit(1);
    return row ?? null;
  }

  async createCycle(params: CreateCycleParams): Promise<BillingCycle> {
    const [row] = await this.db
      .insert(billingCycles)
      .values({
        subscription_id: params.subscriptionId,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        amount_cents: params.amountCents,
        currency: params.currency,
        status: "pending",
      })
      .returning();
    return row!;
  }

  // ── Factures ──────────────────────────────────────────────────────────────

  async findInvoicesByArtisan(ctx: TenantContext, limit = 24): Promise<BillingInvoice[]> {
    return this.db
      .select()
      .from(billingInvoices)
      .where(eq(billingInvoices.artisan_id, ctx.artisanId))
      .orderBy(desc(billingInvoices.created_at))
      .limit(limit);
  }

  // ── Journal immuable ──────────────────────────────────────────────────────

  async appendEvent(params: AppendEventParams): Promise<BillingEvent> {
    const [row] = await this.db
      .insert(billingEvents)
      .values({
        entity_type: params.entityType,
        entity_id: params.entityId,
        event_type: params.eventType,
        payload: params.payload,
        actor: params.actor,
      })
      .returning();
    return row!;
  }

  // ── Stripe customer ID ────────────────────────────────────────────────────

  async findStripeCustomerId(artisanId: number): Promise<string | null> {
    // Priorité 1 : PM maison déjà enregistrée
    const [pm] = await this.db
      .select({ cid: billingPaymentMethods.stripe_customer_id })
      .from(billingPaymentMethods)
      .where(eq(billingPaymentMethods.artisan_id, artisanId))
      .orderBy(desc(billingPaymentMethods.created_at))
      .limit(1);
    if (pm?.cid) return pm.cid;
    // Priorité 2 : table subscriptions legacy (même Stripe customer)
    const [sub] = await this.db
      .select({ cid: subscriptions.stripe_customer_id })
      .from(subscriptions)
      .where(eq(subscriptions.artisan_id, artisanId))
      .limit(1);
    return sub?.cid ?? null;
  }

  async saveStripeCustomerId(_artisanId: number, _stripeCustomerId: string): Promise<void> {
    // Le customer ID est porté par chaque billing_payment_method — pas de table dédiée.
  }
}

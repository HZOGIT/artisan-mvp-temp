import { eq, desc, and, isNull, isNotNull, or, lte, lt, inArray, sql } from "drizzle-orm";
import {
  billingPaymentMethods,
  billingSubscriptions,
  billingCycles,
  billingChargeAttempts,
  billingInvoices,
  billingInvoiceLines,
  billingInvoiceSequences,
  billingEvents,
  billingWebhookEvents,
  artisanModules,
  modules,
} from "../../../../../drizzle/schema.pg";
import type { BillingPaymentMethod, BillingSubscription, BillingCycle, BillingInvoice, BillingEvent, BillingChargeAttempt } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db/with-tenant";
import type { TenantContext } from "../../../shared/tenant";
import type {
  IBillingRepository,
  SavePaymentMethodParams,
  SaveSubscriptionParams,
  CreateCycleParams,
  UpdateCycleStatusParams,
  CreateChargeAttemptParams,
  UpdateChargeAttemptParams,
  SubscriptionWithDueCycle,
  AppendEventParams,
  CreateInvoiceForCycleParams,
} from "../application/billing-repository";

/**
 * billing_payment_methods : RLS tenant — accès via withTenant.
 * billing_invoices : RLS tenant (20260628) — accès via withTenant.
 * billing_subscriptions : RLS désactivé — scope explicite artisan_id.
 */
export class BillingRepositoryDrizzle implements IBillingRepository {
  constructor(private readonly db: DbClient) {}


  async listPaymentMethods(ctx: TenantContext): Promise<BillingPaymentMethod[]> {
    return withTenant(this.db, ctx, (tx) =>
      tx
        .select()
        .from(billingPaymentMethods)
        .where(and(eq(billingPaymentMethods.artisan_id, ctx.artisanId), isNull(billingPaymentMethods.revoked_at)))
        .orderBy(desc(billingPaymentMethods.is_default), desc(billingPaymentMethods.created_at)),
    );
  }

  async findPaymentMethodById(ctx: TenantContext, id: number): Promise<BillingPaymentMethod | null> {
    const [row] = await withTenant(this.db, ctx, (tx) =>
      tx
        .select()
        .from(billingPaymentMethods)
        .where(and(eq(billingPaymentMethods.id, id), eq(billingPaymentMethods.artisan_id, ctx.artisanId)))
        .limit(1),
    );
    return row ?? null;
  }

  async findDefaultPaymentMethod(ctx: TenantContext): Promise<BillingPaymentMethod | null> {
    const [row] = await withTenant(this.db, ctx, (tx) =>
      tx
        .select()
        .from(billingPaymentMethods)
        .where(
          and(
            eq(billingPaymentMethods.artisan_id, ctx.artisanId),
            eq(billingPaymentMethods.is_default, true),
            isNull(billingPaymentMethods.revoked_at),
          ),
        )
        .limit(1),
    );
    return row ?? null;
  }

  async savePaymentMethod(params: SavePaymentMethodParams): Promise<BillingPaymentMethod> {
    const ctx: TenantContext = { artisanId: params.artisanId, userId: 0 };
    const [row] = await withTenant(this.db, ctx, (tx) =>
      tx
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
        .returning(),
    );
    if (!row) throw new Error("DB insert returned no row");
    return row;
  }

  async setDefaultPaymentMethod(ctx: TenantContext, id: number): Promise<void> {
    await withTenant(this.db, ctx, (tx) =>
      tx
        .update(billingPaymentMethods)
        .set({ is_default: sql<boolean>`(${billingPaymentMethods.id} = ${id})` })
        .where(eq(billingPaymentMethods.artisan_id, ctx.artisanId)),
    );
  }

  async revokePaymentMethod(ctx: TenantContext, id: number): Promise<void> {
    await withTenant(this.db, ctx, (tx) =>
      tx
        .update(billingPaymentMethods)
        .set({ is_default: false, revoked_at: new Date() })
        .where(and(eq(billingPaymentMethods.id, id), eq(billingPaymentMethods.artisan_id, ctx.artisanId))),
    );
  }


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
        billing_interval: params.billingInterval ?? "monthly",
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
          billing_interval: params.billingInterval ?? "monthly",
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
    if (!row) throw new Error("DB insert returned no row");
    return row;
  }

  async findExpiredTrials(now: Date, limit = 200): Promise<BillingSubscription[]> {
    return this.db
      .select()
      .from(billingSubscriptions)
      .where(and(eq(billingSubscriptions.status, "trialing"), lte(billingSubscriptions.trial_ends_at, now)))
      .limit(limit);
  }

  async findSubscriptionById(subscriptionId: number): Promise<typeof billingSubscriptions.$inferSelect | null> {
    const [row] = await this.db.select().from(billingSubscriptions).where(eq(billingSubscriptions.id, subscriptionId)).limit(1);
    return row ?? null;
  }

  async updateSubscriptionStatus(ctx: TenantContext, status: string): Promise<void> {
    const now = new Date();
    const set: Record<string, unknown> = { status, updated_at: now };
    if (status === "canceled") set["canceled_at"] = now;
    await this.db.update(billingSubscriptions).set(set).where(eq(billingSubscriptions.artisan_id, ctx.artisanId));
  }

  async updateSubscriptionPeriod(subscriptionId: number, status: string, periodStart: Date, periodEnd: Date): Promise<void> {
    await this.db
      .update(billingSubscriptions)
      .set({ status, current_period_start: periodStart, current_period_end: periodEnd, trial_ends_at: null, updated_at: new Date() })
      .where(eq(billingSubscriptions.id, subscriptionId));
  }

  async updateSubscriptionPaymentMethod(ctx: TenantContext, paymentMethodId: number): Promise<void> {
    await this.db
      .update(billingSubscriptions)
      .set({ payment_method_id: paymentMethodId, updated_at: new Date() })
      .where(eq(billingSubscriptions.artisan_id, ctx.artisanId));
  }

  async updateSubscriptionPlan(ctx: TenantContext, planId: string): Promise<void> {
    await this.db
      .update(billingSubscriptions)
      .set({ plan_id: planId, updated_at: new Date() })
      .where(eq(billingSubscriptions.artisan_id, ctx.artisanId));
  }

  async updateCancelAt(ctx: TenantContext, cancelAt: Date | null): Promise<void> {
    await this.db
      .update(billingSubscriptions)
      .set({ cancel_at: cancelAt, updated_at: new Date() })
      .where(eq(billingSubscriptions.artisan_id, ctx.artisanId));
  }

  async deactivateLockedModules(artisanId: number, planId: string): Promise<void> {
    /** billing planId → plans gating hors-portée à désactiver. */
    const abovePlans: string[] = planId === "enterprise" ? [] : planId === "pro" ? ["entreprise"] : ["pro", "entreprise"];
    if (abovePlans.length === 0) return;
    const slugs = await this.db.select({ slug: modules.slug }).from(modules).where(inArray(modules.plan_minimum, abovePlans));
    if (slugs.length === 0) return;
    await withTenant(this.db, { artisanId, userId: 0 }, (tx) =>
      tx.update(artisanModules)
        .set({ actif: false })
        .where(and(eq(artisanModules.artisan_id, artisanId), inArray(artisanModules.module_slug, slugs.map((r) => r.slug)))),
    );
  }

  async findPendingCycle(subscriptionId: number): Promise<BillingCycle | null> {
    const [row] = await this.db
      .select()
      .from(billingCycles)
      .where(and(eq(billingCycles.subscription_id, subscriptionId), eq(billingCycles.status, "pending")))
      .orderBy(desc(billingCycles.period_start))
      .limit(1);
    return row ?? null;
  }

  async findNonTerminalCycle(subscriptionId: number): Promise<BillingCycle | null> {
    const [row] = await this.db
      .select()
      .from(billingCycles)
      .where(and(eq(billingCycles.subscription_id, subscriptionId), inArray(billingCycles.status, ["pending", "failed"])))
      .orderBy(desc(billingCycles.period_start))
      .limit(1);
    return row ?? null;
  }

  async findPendingCycleForPeriod(subscriptionId: number, periodStart: Date): Promise<BillingCycle | null> {
    const [row] = await this.db
      .select()
      .from(billingCycles)
      .where(and(eq(billingCycles.subscription_id, subscriptionId), eq(billingCycles.status, "pending"), eq(billingCycles.period_start, periodStart)))
      .limit(1);
    return row ?? null;
  }

  async findCycleById(cycleId: number): Promise<BillingCycle | null> {
    const [row] = await this.db.select().from(billingCycles).where(eq(billingCycles.id, cycleId)).limit(1);
    return row ?? null;
  }

  async findAbandonedCycle(subscriptionId: number): Promise<BillingCycle | null> {
    const [row] = await this.db
      .select()
      .from(billingCycles)
      .where(and(eq(billingCycles.subscription_id, subscriptionId), eq(billingCycles.status, "failed"), isNull(billingCycles.next_retry_at)))
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
    if (!row) throw new Error("DB insert returned no row");
    return row;
  }


  async updateCycleStatus(cycleId: number, params: UpdateCycleStatusParams): Promise<void> {
    const set: Record<string, unknown> = { status: params.status, updated_at: new Date() };
    if (params.chargingStartedAt !== undefined) set["charging_started_at"] = params.chargingStartedAt;
    if (params.paidAt !== undefined) set["paid_at"] = params.paidAt;
    if (params.failedAt !== undefined) set["failed_at"] = params.failedAt;
    if (params.nextRetryAt !== undefined) set["next_retry_at"] = params.nextRetryAt;
    if (params.attemptCount !== undefined) set["attempt_count"] = params.attemptCount;
    await this.db.update(billingCycles).set(set).where(eq(billingCycles.id, cycleId));
  }

  async updateCycleAmount(cycleId: number, amountCents: number): Promise<void> {
    await this.db
      .update(billingCycles)
      .set({ amount_cents: amountCents, updated_at: new Date() })
      .where(eq(billingCycles.id, cycleId));
  }

  async claimCycleForCharging(cycleId: number, now: Date, newAttemptCount: number): Promise<boolean> {
    const result = await this.db
      .update(billingCycles)
      .set({ status: "charging", charging_started_at: now, attempt_count: newAttemptCount, updated_at: now })
      .where(
        and(
          eq(billingCycles.id, cycleId),
          or(
            eq(billingCycles.status, "pending"),
            and(eq(billingCycles.status, "failed"), lte(billingCycles.next_retry_at, now)),
          ),
        ),
      );
    return (result.rowCount ?? 0) > 0;
  }

  async findSubscriptionsWithDueCycles(now: Date, limit = 200): Promise<SubscriptionWithDueCycle[]> {
    const dueCycles = await this.db
      .select()
      .from(billingCycles)
      .where(
        or(
          and(eq(billingCycles.status, "pending"), lte(billingCycles.period_start, now)),
          and(eq(billingCycles.status, "failed"), lte(billingCycles.next_retry_at, now)),
        ),
      )
      .limit(limit);
    if (dueCycles.length === 0) return [];

    const subIds = Array.from(new Set(dueCycles.map(c => c.subscription_id)));
    const subs = await this.db
      .select()
      .from(billingSubscriptions)
      .where(and(inArray(billingSubscriptions.id, subIds), inArray(billingSubscriptions.status, ["active", "past_due"])));

    const artisanIds = Array.from(new Set(subs.map(s => s.artisan_id)));
    const pms = await this.db
      .select()
      .from(billingPaymentMethods)
      .where(and(inArray(billingPaymentMethods.artisan_id, artisanIds), eq(billingPaymentMethods.is_default, true), isNull(billingPaymentMethods.revoked_at)));

    const result: SubscriptionWithDueCycle[] = [];
    for (const sub of subs) {
      const cycle = dueCycles.find(c => c.subscription_id === sub.id);
      const pm = pms.find(p => p.artisan_id === sub.artisan_id);
      if (cycle && pm) result.push({ subscription: sub, cycle, paymentMethod: pm });
    }
    return result;
  }

  async findDueCancellations(now: Date, limit = 200): Promise<BillingSubscription[]> {
    return this.db
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          inArray(billingSubscriptions.status, ["active", "past_due"]),
          isNotNull(billingSubscriptions.cancel_at),
          lte(billingSubscriptions.cancel_at, now),
        ),
      )
      .limit(limit);
  }

  async findZombieCycles(now: Date, limit = 200): Promise<BillingCycle[]> {
    const zombieThreshold = new Date(now.getTime() - 15 * 60 * 1000);
    const processingThreshold = new Date(now.getTime() - 72 * 3600_000);
    return this.db
      .select()
      .from(billingCycles)
      .where(
        or(
          and(eq(billingCycles.status, "charging"), lt(billingCycles.charging_started_at, zombieThreshold)),
          and(eq(billingCycles.status, "processing"), lt(billingCycles.charging_started_at, processingThreshold)),
        ),
      )
      .limit(limit);
  }

  async createChargeAttempt(params: CreateChargeAttemptParams): Promise<BillingChargeAttempt> {
    const [row] = await this.db
      .insert(billingChargeAttempts)
      .values({
        cycle_id: params.cycleId,
        attempt_no: params.attemptNo,
        idempotency_key: params.idempotencyKey,
        status: "initiated",
      })
      .returning();
    if (!row) throw new Error("DB insert returned no row");
    return row;
  }

  async updateChargeAttempt(id: number, params: UpdateChargeAttemptParams): Promise<void> {
    const set: Record<string, unknown> = { status: params.status, updated_at: new Date() };
    if (params.stripePaymentIntentId !== undefined) set["stripe_payment_intent_id"] = params.stripePaymentIntentId;
    if (params.failureCode !== undefined) set["failure_code"] = params.failureCode;
    if (params.failureMessage !== undefined) set["failure_message"] = params.failureMessage;
    await this.db.update(billingChargeAttempts).set(set).where(eq(billingChargeAttempts.id, id));
  }

  async findChargeAttemptByPaymentIntentId(paymentIntentId: string): Promise<BillingChargeAttempt | null> {
    const [row] = await this.db
      .select()
      .from(billingChargeAttempts)
      .where(eq(billingChargeAttempts.stripe_payment_intent_id, paymentIntentId))
      .orderBy(desc(billingChargeAttempts.created_at))
      .limit(1);
    return row ?? null;
  }

  async findLastAttemptByCycleId(cycleId: number): Promise<BillingChargeAttempt | null> {
    const [row] = await this.db
      .select()
      .from(billingChargeAttempts)
      .where(eq(billingChargeAttempts.cycle_id, cycleId))
      .orderBy(desc(billingChargeAttempts.created_at))
      .limit(1);
    return row ?? null;
  }

  async findInvoicesByArtisan(ctx: TenantContext, limit = 24): Promise<BillingInvoice[]> {
    return withTenant(this.db, ctx, (tx) =>
      tx
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.artisan_id, ctx.artisanId))
        .orderBy(desc(billingInvoices.created_at))
        .limit(limit),
    );
  }

  async createInvoiceForCycle(params: CreateInvoiceForCycleParams): Promise<BillingInvoice> {
    const ctx: TenantContext = { artisanId: params.artisanId, userId: 0 };
    return withTenant(this.db, ctx, async (tx) => {
      const existing = await tx
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.billing_cycle_id, params.cycleId))
        .limit(1);
      if (existing[0]) return existing[0];

      const year = new Date().getFullYear();
      const [seqRow] = await tx
        .insert(billingInvoiceSequences)
        .values({ series: "FAC", year, next_val: 1 })
        .onConflictDoUpdate({
          target: [billingInvoiceSequences.series, billingInvoiceSequences.year],
          set: { next_val: sql`${billingInvoiceSequences.next_val} + 1` },
        })
        .returning();
      if (!seqRow) throw new Error("sequence upsert returned no row");
      const invoiceNumber = `FAC-${year}-${String(seqRow.next_val).padStart(4, "0")}`;

      const subtotalCents = params.amountCents - params.taxCents;
      const [invoice] = await tx
        .insert(billingInvoices)
        .values({
          artisan_id: params.artisanId,
          number: invoiceNumber,
          type: "subscription",
          status: "paid",
          subtotal_cents: subtotalCents,
          tax_cents: params.taxCents,
          total_cents: params.amountCents,
          currency: params.currency,
          billing_cycle_id: params.cycleId,
          paid_at: new Date(),
        })
        .returning();
      if (!invoice) throw new Error("billing_invoices insert returned no row");

      await tx.insert(billingInvoiceLines).values({
        invoice_id: invoice.id,
        description: params.planDescription,
        quantity: 1,
        unit_amount_cents: subtotalCents,
        amount_cents: subtotalCents,
        tax_rate_bps: 2000,
        tax_amount_cents: params.taxCents,
        type: "subscription",
        sort_order: 0,
      });

      return invoice;
    });
  }


  async markWebhookProcessed(stripeEventId: string, eventType: string, payload: Record<string, unknown>): Promise<boolean> {
    const result = await this.db
      .insert(billingWebhookEvents)
      .values({ stripe_event_id: stripeEventId, type: eventType, payload })
      .onConflictDoNothing({ target: billingWebhookEvents.stripe_event_id });
    return (result.rowCount ?? 0) > 0;
  }

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
    if (!row) throw new Error("DB insert returned no row");
    return row;
  }


  async findStripeCustomerId(artisanId: number): Promise<string | null> {
    const ctx: TenantContext = { artisanId, userId: 0 };
    const [pm] = await withTenant(this.db, ctx, (tx) =>
      tx
        .select({ cid: billingPaymentMethods.stripe_customer_id })
        .from(billingPaymentMethods)
        .where(eq(billingPaymentMethods.artisan_id, artisanId))
        .orderBy(desc(billingPaymentMethods.created_at))
        .limit(1),
    );
    if (pm?.cid) return pm.cid;
    const legacy = await this.db.execute(
      sql`SELECT stripe_customer_id FROM subscriptions WHERE artisan_id = ${artisanId} AND stripe_customer_id IS NOT NULL LIMIT 1`,
    );
    return (legacy.rows[0]?.stripe_customer_id as string | undefined) ?? null;
  }

  async saveStripeCustomerId(_artisanId: number, _stripeCustomerId: string): Promise<void> {
  }

  async countActiveUsers(ctx: TenantContext): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT COUNT(*)::int AS count FROM users WHERE actif = true AND ("artisanId" = ${ctx.artisanId} OR id = (SELECT "userId" FROM artisans WHERE id = ${ctx.artisanId}))`,
    );
    return (result.rows[0]?.count as number | undefined) ?? 0;
  }
}

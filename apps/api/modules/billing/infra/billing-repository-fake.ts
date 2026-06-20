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
} from "../application/billing-repository";
import type {
  BillingPaymentMethod,
  BillingSubscription,
  BillingCycle,
  BillingInvoice,
  BillingEvent,
  BillingChargeAttempt,
} from "../../../../../drizzle/schema.pg";
import type { TenantContext } from "../../../shared/tenant";
import { isDue, isZombie, isStuckProcessing } from "../domain/billing-cycle";

type PM = BillingPaymentMethod;
type Sub = BillingSubscription;
type Cycle = BillingCycle;

let seq = 0;
const nextId = () => ++seq;

export class FakeBillingRepository implements IBillingRepository {
  public pms: PM[] = [];
  public subs: Sub[] = [];
  public cycles: Cycle[] = [];
  public chargeAttempts: BillingChargeAttempt[] = [];
  public invoices: BillingInvoice[] = [];
  public events: BillingEvent[] = [];
  public processedWebhookIds: Set<string> = new Set();
  public customerIds: Map<number, string> = new Map();

  private now() { return new Date(); }

  async listPaymentMethods(ctx: TenantContext): Promise<PM[]> {
    return this.pms
      .filter(p => p.artisan_id === ctx.artisanId && !p.revoked_at)
      .sort((a, b) => Number(b.is_default) - Number(a.is_default));
  }

  async findPaymentMethodById(ctx: TenantContext, id: number): Promise<PM | null> {
    return this.pms.find(p => p.id === id && p.artisan_id === ctx.artisanId) ?? null;
  }

  async findDefaultPaymentMethod(ctx: TenantContext): Promise<PM | null> {
    return this.pms.find(p => p.artisan_id === ctx.artisanId && p.is_default && !p.revoked_at) ?? null;
  }

  async savePaymentMethod(params: SavePaymentMethodParams): Promise<PM> {
    const pm: PM = {
      id: nextId(),
      artisan_id: params.artisanId,
      stripe_customer_id: params.stripeCustomerId,
      stripe_payment_method_id: params.stripePaymentMethodId,
      brand: params.brand,
      last4: params.last4,
      exp_month: params.expMonth,
      exp_year: params.expYear,
      is_default: false,
      consented_at: params.consentedAt,
      revoked_at: null,
      created_at: this.now(),
      updated_at: this.now(),
    };
    this.pms.push(pm);
    return pm;
  }

  async setDefaultPaymentMethod(ctx: TenantContext, id: number): Promise<void> {
    this.pms = this.pms.map(p =>
      p.artisan_id === ctx.artisanId ? { ...p, is_default: p.id === id } : p
    );
  }

  async revokePaymentMethod(ctx: TenantContext, id: number): Promise<void> {
    this.pms = this.pms.map(p =>
      p.id === id && p.artisan_id === ctx.artisanId
        ? { ...p, is_default: false, revoked_at: this.now() }
        : p
    );
  }

  async findSubscription(ctx: TenantContext): Promise<Sub | null> {
    return this.subs.find(s => s.artisan_id === ctx.artisanId) ?? null;
  }

  async saveSubscription(params: SaveSubscriptionParams): Promise<Sub> {
    const existing = this.subs.find(s => s.artisan_id === params.artisanId);
    if (existing) {
      const updated = { ...existing, ...params, artisan_id: params.artisanId, updated_at: this.now() } as Sub;
      this.subs = this.subs.map(s => s.artisan_id === params.artisanId ? updated : s);
      return updated;
    }
    const sub: Sub = {
      id: nextId(),
      artisan_id: params.artisanId,
      plan_id: params.planId,
      billing_interval: params.billingInterval ?? "monthly",
      billing_mode: params.billingMode,
      status: params.status,
      current_period_start: params.currentPeriodStart,
      current_period_end: params.currentPeriodEnd,
      cancel_at: null,
      canceled_at: null,
      trial_ends_at: params.trialEndsAt,
      payment_method_id: params.paymentMethodId,
      created_at: this.now(),
      updated_at: this.now(),
    };
    this.subs.push(sub);
    return sub;
  }

  async findSubscriptionById(subscriptionId: number) {
    return this.subs.find(s => s.id === subscriptionId) ?? null;
  }

  async updateSubscriptionStatus(ctx: TenantContext, status: string): Promise<void> {
    this.subs = this.subs.map(s =>
      s.artisan_id === ctx.artisanId ? { ...s, status, updated_at: this.now() } : s
    );
  }

  async updateSubscriptionPeriod(subscriptionId: number, status: string, periodStart: Date, periodEnd: Date): Promise<void> {
    this.subs = this.subs.map(s =>
      s.id === subscriptionId ? { ...s, status, current_period_start: periodStart, current_period_end: periodEnd, updated_at: this.now() } : s
    );
  }

  async updateSubscriptionPaymentMethod(ctx: TenantContext, paymentMethodId: number): Promise<void> {
    this.subs = this.subs.map(s =>
      s.artisan_id === ctx.artisanId ? { ...s, payment_method_id: paymentMethodId, updated_at: this.now() } : s
    );
  }

  async updateSubscriptionPlan(ctx: TenantContext, planId: string): Promise<void> {
    this.subs = this.subs.map(s =>
      s.artisan_id === ctx.artisanId ? { ...s, plan_id: planId, updated_at: this.now() } : s
    );
  }

  async updateCancelAt(ctx: TenantContext, cancelAt: Date | null): Promise<void> {
    this.subs = this.subs.map(s =>
      s.artisan_id === ctx.artisanId ? { ...s, cancel_at: cancelAt, updated_at: this.now() } : s
    );
  }

  async findPendingCycle(subscriptionId: number): Promise<Cycle | null> {
    return this.cycles.find(c => c.subscription_id === subscriptionId && c.status === "pending") ?? null;
  }

  async findPendingCycleForPeriod(subscriptionId: number, periodStart: Date): Promise<Cycle | null> {
    return this.cycles.find(c => c.subscription_id === subscriptionId && c.status === "pending" && c.period_start.getTime() === periodStart.getTime()) ?? null;
  }

  async findCycleById(cycleId: number): Promise<Cycle | null> {
    return this.cycles.find(c => c.id === cycleId) ?? null;
  }

  async findAbandonedCycle(subscriptionId: number): Promise<Cycle | null> {
    return this.cycles
      .filter(c => c.subscription_id === subscriptionId && c.status === "failed" && c.next_retry_at === null)
      .sort((a, b) => b.period_start.getTime() - a.period_start.getTime())[0] ?? null;
  }

  async createCycle(params: CreateCycleParams): Promise<Cycle> {
    const cycle: Cycle = {
      id: nextId(),
      subscription_id: params.subscriptionId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      amount_cents: params.amountCents,
      currency: params.currency,
      status: "pending",
      charging_started_at: null,
      attempt_count: 0,
      next_retry_at: null,
      paid_at: null,
      failed_at: null,
      created_at: this.now(),
      updated_at: this.now(),
    };
    this.cycles.push(cycle);
    return cycle;
  }

  async updateCycleAmount(cycleId: number, amountCents: number): Promise<void> {
    this.cycles = this.cycles.map(c =>
      c.id === cycleId ? { ...c, amount_cents: amountCents, updated_at: this.now() } : c
    );
  }

  async claimCycleForCharging(cycleId: number, now: Date, newAttemptCount: number): Promise<boolean> {
    const cycle = this.cycles.find(c => c.id === cycleId);
    if (!cycle) return false;
    if (!isDue(cycle as never, now)) return false;
    this.cycles = this.cycles.map(c =>
      c.id === cycleId
        ? { ...c, status: "charging", charging_started_at: now, attempt_count: newAttemptCount, updated_at: this.now() }
        : c
    );
    return true;
  }

  async updateCycleStatus(cycleId: number, params: UpdateCycleStatusParams): Promise<void> {
    this.cycles = this.cycles.map(c => {
      if (c.id !== cycleId) return c;
      return {
        ...c,
        status: params.status,
        charging_started_at: params.chargingStartedAt !== undefined ? params.chargingStartedAt : c.charging_started_at,
        paid_at: params.paidAt !== undefined ? params.paidAt : c.paid_at,
        failed_at: params.failedAt !== undefined ? params.failedAt : c.failed_at,
        next_retry_at: params.nextRetryAt !== undefined ? params.nextRetryAt : c.next_retry_at,
        attempt_count: params.attemptCount !== undefined ? params.attemptCount : c.attempt_count,
        updated_at: this.now(),
      };
    });
  }

  async findSubscriptionsWithDueCycles(now: Date, limit = 200): Promise<SubscriptionWithDueCycle[]> {
    const result: SubscriptionWithDueCycle[] = [];
    for (const sub of this.subs) {
      if (result.length >= limit) break;
      if (sub.status !== "active" && sub.status !== "past_due") continue;
      const cycle = this.cycles.find(c => c.subscription_id === sub.id && isDue(c as never, now));
      if (!cycle) continue;
      const pm = this.pms.find(p => p.artisan_id === sub.artisan_id && p.is_default && !p.revoked_at);
      if (!pm) continue;
      result.push({ subscription: sub, cycle, paymentMethod: pm });
    }
    return result;
  }

  async findZombieCycles(now: Date): Promise<Cycle[]> {
    return this.cycles.filter(c => isZombie(c as never, now) || isStuckProcessing(c as never, now));
  }

  async createChargeAttempt(params: CreateChargeAttemptParams): Promise<BillingChargeAttempt> {
    const attempt: BillingChargeAttempt = {
      id: nextId(),
      cycle_id: params.cycleId,
      attempt_no: params.attemptNo,
      idempotency_key: params.idempotencyKey,
      stripe_payment_intent_id: null,
      status: "initiated",
      failure_code: null,
      failure_message: null,
      created_at: this.now(),
      updated_at: this.now(),
    };
    this.chargeAttempts.push(attempt);
    return attempt;
  }

  async updateChargeAttempt(id: number, params: UpdateChargeAttemptParams): Promise<void> {
    this.chargeAttempts = this.chargeAttempts.map(a => {
      if (a.id !== id) return a;
      return {
        ...a,
        status: params.status,
        stripe_payment_intent_id: params.stripePaymentIntentId !== undefined ? params.stripePaymentIntentId : a.stripe_payment_intent_id,
        failure_code: params.failureCode !== undefined ? params.failureCode : a.failure_code,
        failure_message: params.failureMessage !== undefined ? params.failureMessage : a.failure_message,
        updated_at: this.now(),
      };
    });
  }

  async findInvoicesByArtisan(ctx: TenantContext, limit = 12): Promise<BillingInvoice[]> {
    return this.invoices.filter(i => i.artisan_id === ctx.artisanId).slice(0, limit);
  }

  async markWebhookProcessed(stripeEventId: string, _eventType: string, _payload: Record<string, unknown>): Promise<boolean> {
    if (this.processedWebhookIds.has(stripeEventId)) return false;
    this.processedWebhookIds.add(stripeEventId);
    return true;
  }

  async appendEvent(params: AppendEventParams): Promise<BillingEvent> {
    const ev: BillingEvent = {
      id: nextId(),
      entity_type: params.entityType,
      entity_id: params.entityId,
      event_type: params.eventType,
      payload: params.payload,
      actor: params.actor ?? null,
      created_at: this.now(),
    };
    this.events.push(ev);
    return ev;
  }

  async findChargeAttemptByPaymentIntentId(paymentIntentId: string): Promise<BillingChargeAttempt | null> {
    return this.chargeAttempts.findLast(a => a.stripe_payment_intent_id === paymentIntentId) ?? null;
  }

  async findLastAttemptByCycleId(cycleId: number): Promise<BillingChargeAttempt | null> {
    return this.chargeAttempts.findLast(a => a.cycle_id === cycleId) ?? null;
  }

  async findStripeCustomerId(artisanId: number): Promise<string | null> {
    return this.customerIds.get(artisanId) ?? null;
  }

  async saveStripeCustomerId(artisanId: number, stripeCustomerId: string): Promise<void> {
    this.customerIds.set(artisanId, stripeCustomerId);
  }
}

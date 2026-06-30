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
  EmitOutboxEventParams,
} from "../application/billing-repository";
import type {
  BillingPaymentMethod,
  BillingSubscription,
  BillingCycle,
  BillingInvoice,
  BillingInvoiceLine,
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
  public invoiceLines: BillingInvoiceLine[] = [];
  public events: BillingEvent[] = [];
  public outboxEvents: EmitOutboxEventParams[] = [];
  private seqCounters: Map<string, number> = new Map();
  public processedWebhookIds: Set<string> = new Set();
  public customerIds: Map<number, string> = new Map();
  /** Injecte une erreur dans le prochain appel createCycle (test catch dans activateExpiredTrials). */
  public simulateCreateCycleError: Error | null = null;
  /** Injecte une erreur dans le prochain appel updateSubscriptionStatus (test catch dans processDueCancellations). */
  public simulateUpdateSubStatusError: Error | null = null;
  /** Injecte une erreur dans le prochain appel updateSubscriptionPeriod (test ordre cycle-avant-période). */
  public simulateUpdateSubscriptionPeriodError: Error | null = null;
  /** Injecte une erreur dans le prochain appel appendEvent (test robustesse des catch blocks). */
  public simulateAppendEventError: Error | null = null;
  public activeUserCount = 1;
  /** Appels à deactivateLockedModules — pour assertions dans les tests. */
  public deactivateLockedModulesCalls: { artisanId: number; planId: string }[] = [];

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

  async findExpiredTrials(now: Date, limit = 200): Promise<Sub[]> {
    return this.subs
      .filter(s => s.status === "trialing" && s.trial_ends_at !== null && s.trial_ends_at <= now)
      .slice(0, limit);
  }

  async findDueCancellations(now: Date, limit = 200): Promise<Sub[]> {
    return this.subs
      .filter(s => (s.status === "active" || s.status === "past_due") && s.cancel_at !== null && s.cancel_at <= now)
      .slice(0, limit);
  }

  async saveSubscription(params: SaveSubscriptionParams): Promise<Sub> {
    const existing = this.subs.find(s => s.artisan_id === params.artisanId);
    if (existing) {
      const updated: Sub = {
        ...existing,
        plan_id: params.planId,
        billing_interval: params.billingInterval ?? "monthly",
        billing_mode: params.billingMode,
        status: params.status,
        current_period_start: params.currentPeriodStart,
        current_period_end: params.currentPeriodEnd,
        trial_ends_at: params.trialEndsAt,
        payment_method_id: params.paymentMethodId,
        updated_at: this.now(),
      };
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
    if (this.simulateUpdateSubStatusError) {
      const err = this.simulateUpdateSubStatusError;
      this.simulateUpdateSubStatusError = null;
      throw err;
    }
    const now = this.now();
    this.subs = this.subs.map(s =>
      s.artisan_id === ctx.artisanId
        ? { ...s, status, canceled_at: status === "canceled" ? now : s.canceled_at, updated_at: now }
        : s
    );
  }

  async updateSubscriptionPeriod(subscriptionId: number, status: string, periodStart: Date, periodEnd: Date): Promise<void> {
    if (this.simulateUpdateSubscriptionPeriodError) {
      const err = this.simulateUpdateSubscriptionPeriodError;
      this.simulateUpdateSubscriptionPeriodError = null;
      throw err;
    }
    this.subs = this.subs.map(s =>
      s.id === subscriptionId ? { ...s, status, current_period_start: periodStart, current_period_end: periodEnd, trial_ends_at: null, updated_at: this.now() } : s
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

  async deactivateLockedModules(artisanId: number, planId: string): Promise<void> {
    this.deactivateLockedModulesCalls.push({ artisanId, planId });
  }

  async reactivateDefaultModulesForPlan(_artisanId: number, _planId: string): Promise<void> {
    /* ponytail: stub — tests assertent deactivateLockedModulesCalls, pas la réactivation */
  }

  async findPendingCycle(subscriptionId: number): Promise<Cycle | null> {
    return this.cycles
      .filter(c => c.subscription_id === subscriptionId && c.status === "pending")
      .sort((a, b) => b.period_start.getTime() - a.period_start.getTime())[0] ?? null;
  }

  async findNonTerminalCycle(subscriptionId: number): Promise<Cycle | null> {
    return this.cycles
      .filter(c => c.subscription_id === subscriptionId && (c.status === "pending" || c.status === "failed"))
      .at(-1) ?? null;
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
    if (this.simulateCreateCycleError) {
      const err = this.simulateCreateCycleError;
      this.simulateCreateCycleError = null;
      throw err;
    }
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

  async findZombieCycles(now: Date, limit = 200): Promise<Cycle[]> {
    return this.cycles.filter(c => isZombie(c as never, now) || isStuckProcessing(c as never, now)).slice(0, limit);
  }

  async createChargeAttempt(params: CreateChargeAttemptParams): Promise<BillingChargeAttempt> {
    const duplicate = this.chargeAttempts.find(a => a.cycle_id === params.cycleId && a.attempt_no === params.attemptNo);
    if (duplicate) throw new Error(`duplicate key value violates unique constraint "billing_charge_attempts_cycle_id_attempt_no_key"`);
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

  async createInvoiceForCycle(params: CreateInvoiceForCycleParams): Promise<BillingInvoice> {
    const existing = this.invoices.find(i => i.billing_cycle_id === params.cycleId);
    if (existing) return existing;

    const year = new Date().getFullYear();
    const key = `FAC-${year}`;
    const seq = (this.seqCounters.get(key) ?? 0) + 1;
    this.seqCounters.set(key, seq);
    const number = `FAC-${year}-${String(seq).padStart(4, "0")}`;
    const subtotalCents = params.amountCents - params.taxCents;
    const now = this.now();

    const invoice: BillingInvoice = {
      id: nextId(),
      artisan_id: params.artisanId,
      number,
      stripe_invoice_id: null,
      stripe_invoice_number: null,
      type: "subscription",
      status: "paid",
      subtotal_cents: subtotalCents,
      tax_cents: params.taxCents,
      total_cents: params.amountCents,
      credit_amount_cents: 0,
      refund_amount_cents: 0,
      currency: params.currency,
      billing_cycle_id: params.cycleId,
      original_invoice_id: null,
      stripe_payment_intent_id: null,
      pdf_url: null,
      buyer_siren: null,
      buyer_routing_id: null,
      einvoice_format: null,
      einvoice_status: null,
      einvoice_pa_message_id: null,
      einvoice_hash: null,
      due_at: null,
      paid_at: now,
      voided_at: null,
      created_at: now,
      updated_at: now,
    };
    this.invoices.push(invoice);

    this.invoiceLines.push({
      id: nextId(),
      invoice_id: invoice.id,
      description: params.planDescription,
      quantity: 1,
      unit_amount_cents: subtotalCents,
      amount_cents: subtotalCents,
      tax_rate_bps: 2000,
      tax_amount_cents: params.taxCents,
      type: "subscription",
      metadata: null,
      sort_order: 0,
      created_at: now,
    });

    return invoice;
  }

  async markWebhookProcessed(stripeEventId: string, _eventType: string, _payload: Record<string, unknown>): Promise<boolean> {
    if (this.processedWebhookIds.has(stripeEventId)) return false;
    this.processedWebhookIds.add(stripeEventId);
    return true;
  }

  async appendEvent(params: AppendEventParams): Promise<BillingEvent> {
    if (this.simulateAppendEventError) {
      const err = this.simulateAppendEventError;
      this.simulateAppendEventError = null;
      throw err;
    }
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
    const pm = [...this.pms]
      .filter(p => p.artisan_id === artisanId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
    return pm?.stripe_customer_id ?? this.customerIds.get(artisanId) ?? null;
  }

  async saveStripeCustomerId(artisanId: number, stripeCustomerId: string): Promise<void> {
    this.customerIds.set(artisanId, stripeCustomerId);
  }

  async countActiveUsers(_ctx: TenantContext): Promise<number> {
    return this.activeUserCount;
  }

  async emitOutboxEvent(params: EmitOutboxEventParams): Promise<void> {
    this.outboxEvents.push(params);
  }
}

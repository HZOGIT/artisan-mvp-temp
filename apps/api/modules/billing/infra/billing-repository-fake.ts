import type {
  IBillingRepository,
  SavePaymentMethodParams,
  SaveSubscriptionParams,
  CreateCycleParams,
  AppendEventParams,
} from "../application/billing-repository";
import type {
  BillingPaymentMethod,
  BillingSubscription,
  BillingCycle,
  BillingInvoice,
  BillingEvent,
} from "../../../../../drizzle/schema.pg";
import type { TenantContext } from "../../../shared/tenant";

type PM = BillingPaymentMethod;
type Sub = BillingSubscription;
type Cycle = BillingCycle;

let seq = 0;
const nextId = () => ++seq;

export class FakeBillingRepository implements IBillingRepository {
  public pms: PM[] = [];
  public subs: Sub[] = [];
  public cycles: Cycle[] = [];
  public invoices: BillingInvoice[] = [];
  public events: BillingEvent[] = [];
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

  async updateSubscriptionStatus(ctx: TenantContext, status: string): Promise<void> {
    this.subs = this.subs.map(s =>
      s.artisan_id === ctx.artisanId ? { ...s, status, updated_at: this.now() } : s
    );
  }

  async updateSubscriptionPaymentMethod(ctx: TenantContext, paymentMethodId: number): Promise<void> {
    this.subs = this.subs.map(s =>
      s.artisan_id === ctx.artisanId ? { ...s, payment_method_id: paymentMethodId, updated_at: this.now() } : s
    );
  }

  async findPendingCycle(subscriptionId: number): Promise<Cycle | null> {
    return this.cycles.find(c => c.subscription_id === subscriptionId && c.status === "pending") ?? null;
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

  async findInvoicesByArtisan(ctx: TenantContext, limit = 12): Promise<BillingInvoice[]> {
    return this.invoices.filter(i => i.artisan_id === ctx.artisanId).slice(0, limit);
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

  async findStripeCustomerId(artisanId: number): Promise<string | null> {
    return this.customerIds.get(artisanId) ?? null;
  }

  async saveStripeCustomerId(artisanId: number, stripeCustomerId: string): Promise<void> {
    this.customerIds.set(artisanId, stripeCustomerId);
  }
}

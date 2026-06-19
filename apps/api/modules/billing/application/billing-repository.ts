import type { TenantContext } from "../../../shared/tenant";
import type { BillingPaymentMethod, BillingSubscription, BillingCycle, BillingInvoice, BillingEvent, BillingChargeAttempt } from "../../../../../drizzle/schema.pg";

export interface SavePaymentMethodParams {
  readonly artisanId: number;
  readonly stripeCustomerId: string;
  readonly stripePaymentMethodId: string;
  readonly brand: string;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
  readonly consentedAt: Date;
}

export interface SaveSubscriptionParams {
  readonly artisanId: number;
  readonly planId: string;
  readonly billingMode: "maison" | "stripe";
  readonly status: string;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly trialEndsAt: Date | null;
  readonly paymentMethodId: number | null;
}

export interface CreateCycleParams {
  readonly subscriptionId: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly amountCents: number;
  readonly currency: string;
}

export interface UpdateCycleStatusParams {
  readonly status: string;
  readonly chargingStartedAt?: Date;
  readonly paidAt?: Date | null;
  readonly failedAt?: Date | null;
  readonly nextRetryAt?: Date | null;
  readonly attemptCount?: number;
}

export interface CreateChargeAttemptParams {
  readonly cycleId: number;
  readonly attemptNo: number;
  readonly idempotencyKey: string;
}

export interface UpdateChargeAttemptParams {
  readonly stripePaymentIntentId?: string;
  readonly status: string;
  readonly failureCode?: string | null;
  readonly failureMessage?: string | null;
}

export interface SubscriptionWithDueCycle {
  readonly subscription: BillingSubscription;
  readonly cycle: BillingCycle;
  readonly paymentMethod: BillingPaymentMethod;
}

export interface AppendEventParams {
  readonly entityType: string;
  readonly entityId: number;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly actor?: string;
}

export interface IBillingRepository {
  /** Moyens de paiement */
  listPaymentMethods(ctx: TenantContext): Promise<BillingPaymentMethod[]>;
  findPaymentMethodById(ctx: TenantContext, id: number): Promise<BillingPaymentMethod | null>;
  findDefaultPaymentMethod(ctx: TenantContext): Promise<BillingPaymentMethod | null>;
  savePaymentMethod(params: SavePaymentMethodParams): Promise<BillingPaymentMethod>;
  setDefaultPaymentMethod(ctx: TenantContext, id: number): Promise<void>;
  revokePaymentMethod(ctx: TenantContext, id: number): Promise<void>;

  /** Abonnement maison */
  findSubscription(ctx: TenantContext): Promise<BillingSubscription | null>;
  saveSubscription(params: SaveSubscriptionParams): Promise<BillingSubscription>;
  updateSubscriptionStatus(ctx: TenantContext, status: string): Promise<void>;
  updateSubscriptionPaymentMethod(ctx: TenantContext, paymentMethodId: number): Promise<void>;
  updateSubscriptionPlan(ctx: TenantContext, planId: string): Promise<void>;
  updateCancelAt(ctx: TenantContext, cancelAt: Date | null): Promise<void>;

  /** Cycles */
  findPendingCycle(subscriptionId: number): Promise<BillingCycle | null>;
  createCycle(params: CreateCycleParams): Promise<BillingCycle>;
  updateCycleStatus(cycleId: number, params: UpdateCycleStatusParams): Promise<void>;
  findSubscriptionsWithDueCycles(now: Date): Promise<SubscriptionWithDueCycle[]>;
  findZombieCycles(now: Date): Promise<BillingCycle[]>;

  /** Tentatives de prélèvement */
  createChargeAttempt(params: CreateChargeAttemptParams): Promise<BillingChargeAttempt>;
  updateChargeAttempt(id: number, params: UpdateChargeAttemptParams): Promise<void>;
  findChargeAttemptByPaymentIntentId(paymentIntentId: string): Promise<BillingChargeAttempt | null>;
  findLastAttemptByCycleId(cycleId: number): Promise<BillingChargeAttempt | null>;

  /** Factures */
  findInvoicesByArtisan(ctx: TenantContext, limit?: number): Promise<BillingInvoice[]>;

  /** Journal immuable */
  appendEvent(params: AppendEventParams): Promise<BillingEvent>;

  /** Stripe customer ID pour l'artisan (via la table artisans) */
  findStripeCustomerId(artisanId: number): Promise<string | null>;
  saveStripeCustomerId(artisanId: number, stripeCustomerId: string): Promise<void>;
}

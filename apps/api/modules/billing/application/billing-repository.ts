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
  readonly billingInterval?: "monthly" | "yearly";
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

export type BillingEntityType = "billing_cycle" | "billing_subscription" | "billing_payment_method" | "artisan";

export interface CreateInvoiceForCycleParams {
  readonly artisanId: number;
  readonly cycleId: number;
  readonly amountCents: number;
  readonly taxCents: number;
  readonly currency: string;
  readonly planDescription: string;
}

export interface AppendEventParams {
  readonly entityType: BillingEntityType;
  readonly entityId: number;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly actor?: string;
}

export interface EmitOutboxEventParams {
  readonly artisanId: number;
  readonly userId?: number;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: number;
  readonly payload?: Record<string, unknown>;
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
  findSubscriptionById(subscriptionId: number): Promise<BillingSubscription | null>;
  /** Abonnements trialing dont trial_ends_at est échu — à activer par le scheduler. */
  findExpiredTrials(now: Date, limit?: number): Promise<BillingSubscription[]>;
  /** Abonnements actifs/past_due dont cancel_at est échu — à annuler indépendamment du PM. */
  findDueCancellations(now: Date, limit?: number): Promise<BillingSubscription[]>;
  saveSubscription(params: SaveSubscriptionParams): Promise<BillingSubscription>;
  updateSubscriptionStatus(ctx: TenantContext, status: string): Promise<void>;
  updateSubscriptionPeriod(subscriptionId: number, status: string, periodStart: Date, periodEnd: Date): Promise<void>;
  updateSubscriptionPaymentMethod(ctx: TenantContext, paymentMethodId: number): Promise<void>;
  updateSubscriptionPlan(ctx: TenantContext, planId: string): Promise<void>;
  updateCancelAt(ctx: TenantContext, cancelAt: Date | null): Promise<void>;
  /** Passe actif=false sur les artisan_modules hors plan lors d'un downgrade ou d'une suspension. planId = billing naming : starter|pro|enterprise. */
  deactivateLockedModules(artisanId: number, planId: string): Promise<void>;
  /** Passe actif=true sur les artisan_modules actif_par_defaut compatibles avec le plan — utilisé lors d'un upgrade pour restaurer les modules par défaut du nouveau plan. */
  reactivateDefaultModulesForPlan(artisanId: number, planId: string): Promise<void>;

  /** Cycles */
  findPendingCycle(subscriptionId: number): Promise<BillingCycle | null>;
  /** Cycle non-terminal (pending|failed) le plus récent — utilisé lors d'une annulation de sub pour le passer en skipped. */
  findNonTerminalCycle(subscriptionId: number): Promise<BillingCycle | null>;
  findPendingCycleForPeriod(subscriptionId: number, periodStart: Date): Promise<BillingCycle | null>;
  findCycleById(cycleId: number): Promise<BillingCycle | null>;
  /** Cycle failed avec nextRetryAt=null (dunning épuisé, abandon définitif). */
  findAbandonedCycle(subscriptionId: number): Promise<BillingCycle | null>;
  createCycle(params: CreateCycleParams): Promise<BillingCycle>;
  updateCycleStatus(cycleId: number, params: UpdateCycleStatusParams): Promise<void>;
  updateCycleAmount(cycleId: number, amountCents: number): Promise<void>;
  /**
   * Atomic CAS : passe le cycle à `charging` seulement s'il est encore `pending` ou
   * `failed` avec `next_retry_at <= now`. Retourne false si un autre worker a gagné la race.
   * Prévient le double-prélèvement en multi-réplica.
   */
  claimCycleForCharging(cycleId: number, now: Date, newAttemptCount: number): Promise<boolean>;
  findSubscriptionsWithDueCycles(now: Date, limit?: number): Promise<SubscriptionWithDueCycle[]>;
  findZombieCycles(now: Date, limit?: number): Promise<BillingCycle[]>;

  /** Tentatives de prélèvement */
  createChargeAttempt(params: CreateChargeAttemptParams): Promise<BillingChargeAttempt>;
  updateChargeAttempt(id: number, params: UpdateChargeAttemptParams): Promise<void>;
  findChargeAttemptByPaymentIntentId(paymentIntentId: string): Promise<BillingChargeAttempt | null>;
  findLastAttemptByCycleId(cycleId: number): Promise<BillingChargeAttempt | null>;

  /** Factures */
  findInvoicesByArtisan(ctx: TenantContext, limit?: number): Promise<BillingInvoice[]>;
  createInvoiceForCycle(params: CreateInvoiceForCycleParams): Promise<BillingInvoice>;

  /** Journal immuable */
  appendEvent(params: AppendEventParams): Promise<BillingEvent>;

  /** Bus métier unifié (event_outbox) */
  emitOutboxEvent(params: EmitOutboxEventParams): Promise<void>;

  /**
   * Marque un événement Stripe comme traité (INSERT ... ON CONFLICT DO NOTHING).
   * Retourne true si l'event est nouveau, false si déjà vu (doublon Stripe at-least-once).
   */
  markWebhookProcessed(stripeEventId: string, eventType: string, payload: Record<string, unknown>): Promise<boolean>;

  /** Stripe customer ID pour l'artisan (via la table artisans) */
  findStripeCustomerId(artisanId: number): Promise<string | null>;
  saveStripeCustomerId(artisanId: number, stripeCustomerId: string): Promise<void>;

  /** Nombre d'utilisateurs actifs du tenant (owner + collaborateurs actifs). */
  countActiveUsers(ctx: TenantContext): Promise<number>;
}

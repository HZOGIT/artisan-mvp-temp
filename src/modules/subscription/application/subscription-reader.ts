import type { TenantContext } from "../../../shared/tenant";
import type { SubscriptionRow } from "../domain/subscription";

// Port de lecture de l'abonnement du tenant (table `subscriptions`, HORS RLS → scope explicite
// `artisan_id`).
export interface ISubscriptionReader {
  getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null>;
}

// Port d'écriture (effets billing Stripe). Étend la lecture. ⚠️ Scope EXPLICITE `artisan_id` (HORS RLS).
export interface ISubscriptionRepository extends ISubscriptionReader {
  // Persiste l'état `cancel_at_period_end` (miroir de l'action Stripe — cancel/reactivate).
  setCancelAtPeriodEnd(ctx: TenantContext, cancel: boolean): Promise<void>;
}

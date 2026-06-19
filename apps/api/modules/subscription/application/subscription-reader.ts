import type { TenantContext } from "../../../shared/tenant";
import type { SubscriptionRow } from "../domain/subscription";

/*
 * Port de lecture de l'abonnement du tenant (table `subscriptions`, HORS RLS → scope explicite
 * `artisan_id`).
 */
export interface ISubscriptionReader {
  getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null>;
}

// Port d'écriture (effets billing Stripe). Étend la lecture. ⚠️ Scope EXPLICITE `artisan_id` (HORS RLS).
export interface ISubscriptionRepository extends ISubscriptionReader {
  // Persiste l'état `cancel_at_period_end` (miroir de l'action Stripe — cancel/reactivate).
  setCancelAtPeriodEnd(ctx: TenantContext, cancel: boolean): Promise<void>;
  // Persiste l'id du Customer Stripe (upsert sur la ligne d'abonnement — créé au 1er checkout).
  setStripeCustomerId(ctx: TenantContext, customerId: string): Promise<void>;
  // Raison sociale du tenant (nom du Customer Stripe à la création). null si absente.
  getNomEntreprise(ctx: TenantContext): Promise<string | null>;
}

import type { TenantContext } from "../../../shared/tenant";
import type { SubscriptionRow } from "../domain/subscription";

/** Port de lecture de l'abonnement (billing maison via `billing_subscriptions`). HORS RLS — scope explicite `artisan_id`. */
export interface ISubscriptionReader {
  getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null>;
}

/** Alias rétro-compatible (plus de méthodes d'écriture Stripe). */
export type ISubscriptionRepository = ISubscriptionReader;

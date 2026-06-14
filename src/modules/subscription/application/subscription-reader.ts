import type { TenantContext } from "../../../shared/tenant";
import type { SubscriptionRow } from "../domain/subscription";

// Port de lecture de l'abonnement du tenant (table `subscriptions`, HORS RLS → scope explicite
// `artisan_id`). Lecture seule (les effets Stripe sont hors de ce reader).
export interface ISubscriptionReader {
  getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null>;
}

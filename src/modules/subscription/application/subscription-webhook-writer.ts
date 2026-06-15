import type { SubscriptionUpsertFields } from "../domain/webhook";

// Écriture de la table `subscriptions` (HORS RLS — denylist) depuis le webhook Stripe. Pas de cookie
// tenant : l'artisanId est résolu depuis le metadata Stripe OU le `stripe_customer_id` déjà stocké.
export interface SubscriptionWebhookWriter {
  // artisanId d'un abonnement par son customer Stripe (fallback quand le metadata n'a pas d'artisanId).
  getArtisanIdByCustomerId(customerId: string): Promise<number | null>;
  // Upsert complet de l'abonnement (par artisan_id, unique).
  applyUpsert(artisanId: number, fields: SubscriptionUpsertFields): Promise<void>;
  // Extinction (plan expired / canceled) sans toucher au reste.
  applyDeleted(artisanId: number, fields: { plan: string; status: string; cancelAtPeriodEnd: boolean }): Promise<void>;
}

/*
 * Effets des évènements PAIEMENT/FACTURE du webhook Stripe (`checkout.session.completed`,
 * `payment_intent.payment_failed`). Le `tokenPaiement` EST la capacité (résolu sous public-token RLS),
 * puis les effets (paiement/facture/notif) repassent sous le tenant résolu (`withTenant`).
 */

export interface PaiementResolu {
  readonly paiementId: number;
  readonly factureId: number;
  readonly artisanId: number;
}

export interface WebhookPaymentWriter {
  /** Résout le paiement par son token (sous public-token RLS), ou null. */
  resolvePaiement(token: string): Promise<PaiementResolu | null>;
  /** Checkout payé (sous le tenant résolu) : paiement→complete + facture→payée + notification artisan. */
  completeCheckout(input: { artisanId: number; paiementId: number; factureId: number; stripePaymentIntentId: string; stripeChargeId?: string | null }): Promise<void>;
  /** Paiement échoué (sous le tenant résolu) : paiement→echoue. */
  failPaiement(input: { artisanId: number; paiementId: number }): Promise<void>;
}

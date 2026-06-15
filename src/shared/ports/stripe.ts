// Port Stripe (billing). Les use-cases en dépendent (interface), jamais du SDK. L'adapter concret
// (`StripeAdapter`) instancie le SDK via un import variable-de-chemin (hors typecheck src), avec la
// clé `STRIPE_SECRET_KEY` du legacy. ⚠️ Toute opération est un effet de bord facturable → tests via
// `FakeStripePort` (aucun réseau).

export interface StripeLineItem {
  readonly price: string;
  readonly quantity: number;
}

export interface CreateCustomerParams {
  readonly email?: string;
  readonly name: string;
  readonly metadata: Record<string, string>;
}

export interface CreateCheckoutParams {
  readonly customerId: string;
  readonly lineItems: readonly StripeLineItem[];
  readonly trialPeriodDays: number;
  readonly subscriptionMetadata: Record<string, string>;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly metadata: Record<string, string>;
}

// Évènement webhook Stripe (forme minimale exploitée par les use-cases). `data.object` = la
// ressource (subscription/checkout.session/invoice…) selon `type`.
export interface StripeWebhookEvent {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: Record<string, unknown> };
}

export interface StripePort {
  // Vérifie la signature d'un webhook (HMAC `STRIPE_WEBHOOK_SECRET`) et renvoie l'évènement.
  // ⚠️ **fail-closed** : LÈVE une exception si la signature est invalide → l'appelant rejette (400).
  // Ne JAMAIS appeler avec un secret vide (un attaquant forgerait une signature à clé vide, OPE-79).
  constructEvent(rawBody: Buffer, signature: string, secret: string): Promise<StripeWebhookEvent>;
  // Crée un Customer Stripe (à la 1re souscription). Renvoie son id.
  createCustomer(params: CreateCustomerParams): Promise<{ id: string }>;
  // Crée une session Checkout (mode subscription). Renvoie l'URL de redirection (null possible).
  createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string | null }>;
  // Crée une session du portail de facturation (gérer carte/factures). Renvoie l'URL.
  createBillingPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string | null }>;
  // Bascule `cancel_at_period_end` sur l'abonnement Stripe (annulation/réactivation en fin de période).
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void>;
  // Recharge l'abonnement Stripe (webhook `invoice.payment_succeeded` → `current_period_*` à jour).
  retrieveSubscription(subscriptionId: string): Promise<{ status: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null }>;
}

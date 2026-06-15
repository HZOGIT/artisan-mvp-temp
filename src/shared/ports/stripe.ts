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

export interface StripePort {
  // Crée un Customer Stripe (à la 1re souscription). Renvoie son id.
  createCustomer(params: CreateCustomerParams): Promise<{ id: string }>;
  // Crée une session Checkout (mode subscription). Renvoie l'URL de redirection (null possible).
  createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string | null }>;
  // Crée une session du portail de facturation (gérer carte/factures). Renvoie l'URL.
  createBillingPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string | null }>;
  // Bascule `cancel_at_period_end` sur l'abonnement Stripe (annulation/réactivation en fin de période).
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void>;
}

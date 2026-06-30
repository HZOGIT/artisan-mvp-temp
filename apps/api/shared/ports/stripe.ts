export interface StripeWebhookEvent {
  readonly id: string;
  readonly type: string;
  /** Présent sur les events Connect : ID du compte connecté (`acct_…`). */
  readonly account?: string;
  readonly data: { readonly object: Record<string, unknown> };
}

export interface CreateCustomerParams {
  readonly email?: string;
  readonly name: string;
  readonly metadata: Record<string, string>;
}

export interface CreateInvoiceCheckoutParams {
  readonly factureId: number;
  readonly numeroFacture: string;
  readonly montantTTC: number;
  readonly clientEmail: string;
  readonly clientName: string;
  readonly artisanName: string;
  readonly artisanId: number;
  readonly userId: number;
  readonly origin: string;
  readonly tokenPaiement: string;
  readonly portalToken: string;
  /** ID du compte Stripe Connect de l'artisan (direct charge — Stripe-Account header). */
  readonly stripeConnectAccountId: string;
}

export interface CheckoutSessionStatus {
  readonly paymentStatus: string;
  readonly paymentIntentId: string | null;
  /** Stripe session.status : "open" | "complete" | "expired". Null si la session est introuvable. */
  readonly sessionStatus: string | null;
}

export interface CreateConnectAccountParams {
  readonly country: string;
  readonly email: string | null;
}

export interface CreateAccountLinkParams {
  readonly accountId: string;
  readonly refreshUrl: string;
  readonly returnUrl: string;
}

/** Données minimales d'un compte Connect Stripe (accounts.retrieve). */
export interface ConnectAccountData {
  readonly charges_enabled: boolean;
  readonly payouts_enabled: boolean;
  readonly details_submitted: boolean;
  readonly requirements: Record<string, unknown> | null;
}

export interface StripePort {
  constructEvent(rawBody: Buffer, signature: string, secret: string): Promise<StripeWebhookEvent>;
  createCustomer(params: CreateCustomerParams): Promise<{ id: string }>;
  createInvoiceCheckout(params: CreateInvoiceCheckoutParams): Promise<{ url: string | null; sessionId: string }>;
  /** `accountId` : ID du compte connecté pour les Checkout Sessions direct charge (Lot 4+). */
  retrieveCheckoutSession(sessionId: string, accountId?: string): Promise<CheckoutSessionStatus | null>;
  createConnectAccount(params: CreateConnectAccountParams): Promise<{ id: string }>;
  createAccountLink(params: CreateAccountLinkParams): Promise<{ url: string }>;
  retrieveConnectAccount(accountId: string): Promise<ConnectAccountData>;
}

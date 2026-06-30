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
}

export interface CheckoutSessionStatus {
  readonly paymentStatus: string;
  readonly paymentIntentId: string | null;
}

export interface StripePort {
  constructEvent(rawBody: Buffer, signature: string, secret: string): Promise<StripeWebhookEvent>;
  createCustomer(params: CreateCustomerParams): Promise<{ id: string }>;
  createInvoiceCheckout(params: CreateInvoiceCheckoutParams): Promise<{ url: string | null; sessionId: string }>;
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionStatus | null>;
}

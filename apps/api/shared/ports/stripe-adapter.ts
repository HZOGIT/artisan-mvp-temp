import type { CheckoutSessionStatus, CreateAccountLinkParams, CreateConnectAccountParams, CreateCustomerParams, CreateInvoiceCheckoutParams, StripePort, StripeWebhookEvent } from "./stripe";
import { getSecret } from "../config/secrets";

const STRIPE_MODULE = "stripe";

type StripeSDK = {
  customers: { create(p: unknown): Promise<{ id: string }> };
  checkout: {
    sessions: {
      create(p: unknown): Promise<{ id: string; url: string | null }>;
      retrieve(id: string): Promise<{ payment_status: string; payment_intent: string | { id: string } | null }>;
    };
  };
  webhooks: { constructEvent(payload: Buffer, signature: string, secret: string): StripeWebhookEvent & { account?: string } };
  accounts: { create(p: unknown): Promise<{ id: string }> };
  accountLinks: { create(p: unknown): Promise<{ url: string }> };
};

export class StripeAdapter implements StripePort {
  private client: StripeSDK | null = null;
  constructor(private readonly secretKey = getSecret("STRIPE_SECRET_KEY") ?? "") {}

  private async sdk(): Promise<StripeSDK> {
    if (this.client) return this.client;
    const mod = (await import(STRIPE_MODULE)) as { default: new (key: string) => StripeSDK };
    this.client = new mod.default(this.secretKey);
    return this.client;
  }

  async constructEvent(rawBody: Buffer, signature: string, secret: string): Promise<StripeWebhookEvent> {
    const s = await this.sdk();
    const ev = s.webhooks.constructEvent(rawBody, signature, secret);
    return { id: ev.id, type: ev.type, ...(ev.account ? { account: ev.account } : {}), data: { object: ev.data.object } };
  }

  async createCustomer(p: CreateCustomerParams): Promise<{ id: string }> {
    const s = await this.sdk();
    return s.customers.create({ email: p.email || undefined, name: p.name, metadata: p.metadata });
  }

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionStatus | null> {
    try {
      const s = await this.sdk();
      const session = await s.checkout.sessions.retrieve(sessionId);
      const piId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as { id: string } | null)?.id ?? null;
      return { paymentStatus: session.payment_status, paymentIntentId: piId };
    } catch {
      return null;
    }
  }

  async createInvoiceCheckout(p: CreateInvoiceCheckoutParams): Promise<{ url: string | null; sessionId: string }> {
    const s = await this.sdk();
    const session = await s.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: p.clientEmail || undefined,
      client_reference_id: String(p.factureId),
      allow_promotion_codes: true,
      locale: "fr",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Facture ${p.numeroFacture}`, description: `Paiement de facture pour ${p.clientName} - ${p.artisanName}` },
            unit_amount: Math.round(parseFloat(p.montantTTC.toFixed(2)) * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        facture_id: String(p.factureId),
        artisan_id: String(p.artisanId),
        user_id: String(p.userId),
        customer_email: p.clientEmail,
        customer_name: p.clientName,
        numero_facture: p.numeroFacture,
        token_paiement: p.tokenPaiement,
      },
      success_url: `${p.origin}/portail/${p.portalToken}?paiement=succes&factureId=${p.factureId}`,
      cancel_url: `${p.origin}/portail/${p.portalToken}?paiement=annule`,
    });
    return { url: session.url, sessionId: session.id };
  }

  async createConnectAccount(p: CreateConnectAccountParams): Promise<{ id: string }> {
    const s = await this.sdk();
    return s.accounts.create({
      controller: {
        stripe_dashboard: { type: "full" },
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
      },
      country: p.country,
      email: p.email || undefined,
    });
  }

  async createAccountLink(p: CreateAccountLinkParams): Promise<{ url: string }> {
    const s = await this.sdk();
    return s.accountLinks.create({
      account: p.accountId,
      refresh_url: p.refreshUrl,
      return_url: p.returnUrl,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
    });
  }
}

export class FakeStripePort implements StripePort {
  public customers: CreateCustomerParams[] = [];
  private seq = 0;
  public acceptSignature = "valid-sig";

  async constructEvent(rawBody: Buffer, signature: string): Promise<StripeWebhookEvent> {
    if (signature !== this.acceptSignature) throw new Error("Invalid signature");
    return JSON.parse(rawBody.toString("utf8")) as StripeWebhookEvent;
  }

  async createCustomer(p: CreateCustomerParams): Promise<{ id: string }> {
    this.customers.push(p);
    return { id: `cus_fake_${++this.seq}` };
  }

  public invoiceCheckouts: CreateInvoiceCheckoutParams[] = [];
  async createInvoiceCheckout(p: CreateInvoiceCheckoutParams): Promise<{ url: string | null; sessionId: string }> {
    this.invoiceCheckouts.push(p);
    const id = `cs_invoice_${++this.seq}`;
    return { url: `https://checkout.stripe.test/${id}`, sessionId: id };
  }

  public sessionStatuses: Map<string, CheckoutSessionStatus> = new Map();
  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionStatus | null> {
    return this.sessionStatuses.get(sessionId) ?? { paymentStatus: "unpaid", paymentIntentId: null };
  }

  public connectAccounts: CreateConnectAccountParams[] = [];
  async createConnectAccount(p: CreateConnectAccountParams): Promise<{ id: string }> {
    this.connectAccounts.push(p);
    return { id: `acct_fake_${++this.seq}` };
  }

  public accountLinks: CreateAccountLinkParams[] = [];
  async createAccountLink(p: CreateAccountLinkParams): Promise<{ url: string }> {
    this.accountLinks.push(p);
    return { url: `https://connect.stripe.test/onboarding/${p.accountId}_${++this.seq}` };
  }
}

import type { CreateCustomerParams, CreateInvoiceCheckoutParams, StripePort, StripeWebhookEvent } from "./stripe";

const STRIPE_MODULE = "stripe";

type StripeSDK = {
  customers: { create(p: unknown): Promise<{ id: string }> };
  checkout: { sessions: { create(p: unknown): Promise<{ id: string; url: string | null }> } };
  subscriptions: {
    update(id: string, p: unknown): Promise<unknown>;
    retrieve(id: string): Promise<{ status?: string; current_period_start?: number; current_period_end?: number }>;
  };
  webhooks: { constructEvent(payload: Buffer, signature: string, secret: string): StripeWebhookEvent };
};

const epochToDate = (s: number | undefined): Date | null => (typeof s === "number" && s > 0 ? new Date(s * 1000) : null);

export class StripeAdapter implements StripePort {
  private client: StripeSDK | null = null;
  constructor(private readonly secretKey = process.env.STRIPE_SECRET_KEY ?? "") {}

  private async sdk(): Promise<StripeSDK> {
    if (this.client) return this.client;
    const mod = (await import(STRIPE_MODULE)) as { default: new (key: string) => StripeSDK };
    this.client = new mod.default(this.secretKey);
    return this.client;
  }

  async constructEvent(rawBody: Buffer, signature: string, secret: string): Promise<StripeWebhookEvent> {
    const s = await this.sdk();
    const ev = s.webhooks.constructEvent(rawBody, signature, secret);
    return { id: ev.id, type: ev.type, data: { object: ev.data.object } };
  }

  async createCustomer(p: CreateCustomerParams): Promise<{ id: string }> {
    const s = await this.sdk();
    return s.customers.create({ email: p.email || undefined, name: p.name, metadata: p.metadata });
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

  async setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void> {
    const s = await this.sdk();
    await s.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel });
  }

  async retrieveSubscription(subscriptionId: string): Promise<{ status: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null }> {
    const s = await this.sdk();
    const sub = await s.subscriptions.retrieve(subscriptionId);
    return { status: sub.status ?? "active", currentPeriodStart: epochToDate(sub.current_period_start), currentPeriodEnd: epochToDate(sub.current_period_end) };
  }
}

export class FakeStripePort implements StripePort {
  public customers: CreateCustomerParams[] = [];
  public cancelToggles: { subscriptionId: string; cancel: boolean }[] = [];
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

  async setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void> {
    this.cancelToggles.push({ subscriptionId, cancel });
  }

  public retrievedSubscription = { status: "active", currentPeriodStart: null as Date | null, currentPeriodEnd: null as Date | null };
  async retrieveSubscription(): Promise<{ status: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null }> {
    return this.retrievedSubscription;
  }
}

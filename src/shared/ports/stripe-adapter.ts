import type { CreateCheckoutParams, CreateCustomerParams, StripePort, StripeWebhookEvent } from "./stripe";

// Adapter Stripe : instancie le SDK `stripe` via un import variable-de-chemin (le SDK n'entre PAS dans
// le typecheck de src/**), avec la clé `STRIPE_SECRET_KEY` (réutilisée du legacy). Mappe le port vers
// l'API SDK (snake_case). Le client est mémoïsé.
const STRIPE_MODULE = "stripe";

type StripeSDK = {
  customers: { create(p: unknown): Promise<{ id: string }> };
  checkout: { sessions: { create(p: unknown): Promise<{ url: string | null }> } };
  billingPortal: { sessions: { create(p: unknown): Promise<{ url: string | null }> } };
  subscriptions: { update(id: string, p: unknown): Promise<unknown> };
  webhooks: { constructEvent(payload: Buffer, signature: string, secret: string): StripeWebhookEvent };
};

export class StripeAdapter implements StripePort {
  private client: StripeSDK | null = null;
  constructor(private readonly secretKey = process.env.STRIPE_SECRET_KEY ?? "") {}

  private async sdk(): Promise<StripeSDK> {
    if (this.client) return this.client;
    const mod = (await import(STRIPE_MODULE)) as { default: new (key: string) => StripeSDK };
    this.client = new mod.default(this.secretKey);
    return this.client;
  }

  // Vérif signature via le SDK (`webhooks.constructEvent`) — LÈVE si invalide (fail-closed).
  async constructEvent(rawBody: Buffer, signature: string, secret: string): Promise<StripeWebhookEvent> {
    const s = await this.sdk();
    const ev = s.webhooks.constructEvent(rawBody, signature, secret);
    return { id: ev.id, type: ev.type, data: { object: ev.data.object } };
  }

  async createCustomer(p: CreateCustomerParams): Promise<{ id: string }> {
    const s = await this.sdk();
    return s.customers.create({ email: p.email || undefined, name: p.name, metadata: p.metadata });
  }

  async createCheckoutSession(p: CreateCheckoutParams): Promise<{ url: string | null }> {
    const s = await this.sdk();
    return s.checkout.sessions.create({
      customer: p.customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: p.lineItems.map((li) => ({ price: li.price, quantity: li.quantity })),
      subscription_data: { trial_period_days: p.trialPeriodDays, metadata: p.subscriptionMetadata },
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      metadata: p.metadata,
    });
  }

  async createBillingPortalSession(p: { customerId: string; returnUrl: string }): Promise<{ url: string | null }> {
    const s = await this.sdk();
    return s.billingPortal.sessions.create({ customer: p.customerId, return_url: p.returnUrl });
  }

  async setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void> {
    const s = await this.sdk();
    await s.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel });
  }
}

// Fake déterministe (tests) : enregistre les appels, renvoie des urls/ids fictifs, aucun réseau.
export class FakeStripePort implements StripePort {
  public customers: CreateCustomerParams[] = [];
  public checkouts: CreateCheckoutParams[] = [];
  public portals: { customerId: string; returnUrl: string }[] = [];
  public cancelToggles: { subscriptionId: string; cancel: boolean }[] = [];
  private seq = 0;
  // Signature acceptée par le fake `constructEvent` (les autres → throw, comme une signature invalide).
  public acceptSignature = "valid-sig";

  async constructEvent(rawBody: Buffer, signature: string): Promise<StripeWebhookEvent> {
    if (signature !== this.acceptSignature) throw new Error("Invalid signature");
    return JSON.parse(rawBody.toString("utf8")) as StripeWebhookEvent;
  }

  async createCustomer(p: CreateCustomerParams): Promise<{ id: string }> {
    this.customers.push(p);
    return { id: `cus_fake_${++this.seq}` };
  }
  async createCheckoutSession(p: CreateCheckoutParams): Promise<{ url: string | null }> {
    this.checkouts.push(p);
    return { url: `https://checkout.stripe.test/session_${++this.seq}` };
  }
  async createBillingPortalSession(p: { customerId: string; returnUrl: string }): Promise<{ url: string | null }> {
    this.portals.push(p);
    return { url: `https://billing.stripe.test/portal_${++this.seq}` };
  }
  async setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void> {
    this.cancelToggles.push({ subscriptionId, cancel });
  }
}

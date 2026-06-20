import type { BillingPort, ChargeOffSessionParams, ChargeResult, PaymentIntentInfo, PaymentMethodInfo, SetupIntentResult } from "./billing";

/*
 * Adapter Stripe pour le billing maison off-session. Même pattern que StripeAdapter : import variable
 * (SDK hors typecheck), client mémoïsé, clé `STRIPE_SECRET_KEY` existante.
 */
const STRIPE_MODULE = "stripe";

type StripeSDK = {
  setupIntents: {
    create(p: unknown): Promise<{ id: string; client_secret: string | null }>;
  };
  paymentMethods: {
    retrieve(id: string): Promise<{
      id: string;
      card?: { brand: string; last4: string; exp_month: number; exp_year: number };
    }>;
  };
  paymentIntents: {
    create(p: unknown, opts?: { idempotencyKey?: string }): Promise<{ id: string; status: string; client_secret: string | null; next_action?: { redirect_to_url?: { url?: string } } }>;
    retrieve(id: string): Promise<{ id: string; status: string; last_payment_error?: { code?: string; message?: string }; next_action?: { redirect_to_url?: { url?: string } } }>;
  };
  refunds: {
    create(p: unknown): Promise<unknown>;
  };
};

export class BillingAdapter implements BillingPort {
  private client: StripeSDK | null = null;
  constructor(private readonly secretKey = process.env.STRIPE_SECRET_KEY ?? "") {}

  private async sdk(): Promise<StripeSDK> {
    if (this.client) return this.client;
    const mod = (await import(STRIPE_MODULE)) as { default: new (key: string) => StripeSDK };
    this.client = new mod.default(this.secretKey);
    return this.client;
  }

  async createSetupIntent(customerId: string): Promise<SetupIntentResult> {
    const s = await this.sdk();
    const si = await s.setupIntents.create({ customer: customerId, payment_method_types: ["card"], usage: "off_session" });
    return { clientSecret: si.client_secret ?? "", setupIntentId: si.id };
  }

  async retrievePaymentMethod(paymentMethodId: string): Promise<PaymentMethodInfo> {
    const s = await this.sdk();
    const pm = await s.paymentMethods.retrieve(paymentMethodId);
    return {
      paymentMethodId: pm.id,
      brand: pm.card?.brand ?? "unknown",
      last4: pm.card?.last4 ?? "????",
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
    };
  }

  async chargeOffSession(params: ChargeOffSessionParams): Promise<ChargeResult> {
    const s = await this.sdk();
    const pi = await s.paymentIntents.create(
      {
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        amount: params.amountCents,
        currency: params.currency,
        description: params.description,
        metadata: params.metadata,
        off_session: true,
        confirm: true,
      },
      { idempotencyKey: params.idempotencyKey },
    );
    const status: ChargeResult["status"] = pi.status === "succeeded" ? "succeeded" : pi.status === "requires_action" ? "requires_action" : "processing";
    return { paymentIntentId: pi.id, status, clientSecret: pi.client_secret ?? undefined };
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentInfo> {
    const s = await this.sdk();
    const pi = await s.paymentIntents.retrieve(paymentIntentId);
    return {
      id: pi.id,
      status: pi.status,
      failureCode: pi.last_payment_error?.code ?? null,
      failureMessage: pi.last_payment_error?.message ?? null,
    };
  }

  async handleRequiresAction(paymentIntentId: string, returnUrl: string): Promise<{ redirectUrl: string }> {
    const s = await this.sdk();
    const pi = await s.paymentIntents.retrieve(paymentIntentId);
    const url = pi.next_action?.redirect_to_url?.url ?? `${returnUrl}?payment_intent=${paymentIntentId}`;
    return { redirectUrl: url };
  }

  async refund(paymentIntentId: string, amountCents?: number): Promise<void> {
    const s = await this.sdk();
    const params: Record<string, unknown> = { payment_intent: paymentIntentId };
    if (amountCents !== undefined) params.amount = amountCents;
    await s.refunds.create(params);
  }
}

/** Fake déterministe (tests) : enregistre les appels, aucun réseau. */
export class FakeBillingPort implements BillingPort {
  public setupIntentsCreated: string[] = [];
  public chargesAttempted: ChargeOffSessionParams[] = [];
  public refundsIssued: { paymentIntentId: string; amountCents?: number }[] = [];
  /** Override dans les tests pour simuler requires_action ou processing. null = lève une erreur (dunning). */
  public nextChargeResult: ChargeResult | null = { paymentIntentId: "pi_fake_1", status: "succeeded" };
  /** Message d'erreur simulé quand nextChargeResult = null. */
  public nextChargeError = "card_declined";
  private seq = 0;

  async createSetupIntent(customerId: string): Promise<SetupIntentResult> {
    this.setupIntentsCreated.push(customerId);
    const n = ++this.seq;
    return { clientSecret: `seti_${n}_secret`, setupIntentId: `seti_${n}` };
  }

  async retrievePaymentMethod(paymentMethodId: string): Promise<PaymentMethodInfo> {
    return { paymentMethodId, brand: "visa", last4: "4242", expMonth: 12, expYear: 2028 };
  }

  async chargeOffSession(params: ChargeOffSessionParams): Promise<ChargeResult> {
    this.chargesAttempted.push(params);
    if (this.nextChargeResult === null) throw new Error(this.nextChargeError);
    return this.nextChargeResult;
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentInfo> {
    return { id: paymentIntentId, status: "succeeded", failureCode: null, failureMessage: null };
  }

  async handleRequiresAction(_paymentIntentId: string, returnUrl: string): Promise<{ redirectUrl: string }> {
    return { redirectUrl: `${returnUrl}?requires_action=1` };
  }

  async refund(paymentIntentId: string, amountCents?: number): Promise<void> {
    this.refundsIssued.push({ paymentIntentId, amountCents });
  }
}

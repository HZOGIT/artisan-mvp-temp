/*
 * Port billing maison (off-session). Remplace la surface "abonnement Stripe" du StripePort.
 * Le StripePort conserve : createCustomer, constructEvent, createInvoiceCheckout.
 * L'adapter concret BillingAdapter (stripe-sdk) + le FakeBillingPort (tests) sont dans billing-adapter.ts.
 */

export interface SetupIntentResult {
  readonly clientSecret: string;
  readonly setupIntentId: string;
}

export interface PaymentMethodInfo {
  readonly paymentMethodId: string;
  readonly brand: string;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
}

export interface ChargeOffSessionParams {
  readonly customerId: string;
  readonly paymentMethodId: string;
  readonly amountCents: number;
  readonly currency: "eur";
  readonly description: string;
  readonly metadata: Record<string, string>;
  /** Format : `billing-cycle-{cycleId}-attempt-{n}` — clé d'idempotence anti double-prélèvement. */
  readonly idempotencyKey: string;
}

export type ChargeStatus = "succeeded" | "requires_action" | "processing";

export interface ChargeResult {
  readonly paymentIntentId: string;
  readonly status: ChargeStatus;
  /** Présent si status = requires_action (3DS SCA). */
  readonly clientSecret?: string;
}

export interface PaymentIntentInfo {
  readonly id: string;
  readonly status: string;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
}

export interface BillingPort {
  /** Crée un SetupIntent off-session pour collecter un mandat récurrent (Stripe Elements). */
  createSetupIntent(customerId: string): Promise<SetupIntentResult>;
  /** Récupère les informations d'un PaymentMethod (post-confirmation côté client). */
  retrievePaymentMethod(paymentMethodId: string): Promise<PaymentMethodInfo>;
  /**
   * Prélèvement off-session (MIT).
   * PROTOCOLE ANTI DOUBLE-PRÉLÈVEMENT : l'appelant DOIT persister `params.idempotencyKey`
   * dans `billing_charge_attempts` AVANT d'appeler cette méthode. En cas de retry, réutiliser
   * la même clé — Stripe déduplictera côté serveur.
   */
  chargeOffSession(params: ChargeOffSessionParams): Promise<ChargeResult>;
  /** Récupère l'état courant d'un PaymentIntent (réconciliation zombie / webhook manqué). */
  retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentInfo>;
  /** Construit l'URL de re-authentification 3DS pour un PaymentIntent en requires_action. */
  handleRequiresAction(paymentIntentId: string, returnUrl: string): Promise<{ redirectUrl: string }>;
  /** Rembourse partiellement ou totalement un PaymentIntent. */
  refund(paymentIntentId: string, amountCents?: number): Promise<void>;
}

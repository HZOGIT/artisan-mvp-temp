import type { WebhookPaymentWriter, PaiementResolu } from "../application/webhook-payment-writer";

/** Writer paiement webhook fake (in-memory) pour les tests des use-cases. */
export class FakeWebhookPaymentWriter implements WebhookPaymentWriter {
  private byToken = new Map<string, PaiementResolu>();
  public completed: Array<{ artisanId: number; paiementId: number; factureId: number; stripePaymentIntentId: string; stripeChargeId?: string | null }> = [];
  public failed: Array<{ artisanId: number; paiementId: number }> = [];

  seed(token: string, resolu: PaiementResolu): void {
    this.byToken.set(token, resolu);
  }

  async resolvePaiement(token: string): Promise<PaiementResolu | null> {
    return this.byToken.get(token) ?? null;
  }
  async completeCheckout(input: { artisanId: number; paiementId: number; factureId: number; stripePaymentIntentId: string; stripeChargeId?: string | null }): Promise<{ transitioned: boolean }> {
    this.completed.push(input);
    return { transitioned: true };
  }
  async failPaiement(input: { artisanId: number; paiementId: number }): Promise<void> {
    this.failed.push(input);
  }
}

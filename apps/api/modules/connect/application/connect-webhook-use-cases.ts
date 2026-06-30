import type { StripePort } from "../../../shared/ports/stripe";
import type { AppLogger } from "../../../shared/ports/logger";
import type { ConnectArtisanWriter } from "./connect-artisan-writer";
import type { WebhookPaymentWriter } from "../../subscription/application/webhook-payment-writer";

export interface ConnectWebhookDeps {
  readonly stripe: StripePort;
  /** Implémentation Drizzle (owner pool) injectée depuis app.ts. */
  readonly writer: ConnectArtisanWriter;
  readonly webhookSecret: string;
  readonly log?: AppLogger;
  /** Soldage des paiements de factures (checkout.session.completed / payment_intent.payment_failed depuis compte connecté). */
  readonly paymentWriter?: WebhookPaymentWriter;
  /** Best-effort compta après paiement portail (génération des écritures vente + encaissement). */
  readonly genererEcrituresFacture?: (artisanId: number, factureId: number) => Promise<void>;
  /**
   * Email de confirmation de paiement envoyé au client après checkout.session.completed Connect.
   * Best-effort : l'erreur est loggée mais ne bloque pas la confirmation du paiement.
   */
  readonly onCheckoutCompletedEmail?: (data: {
    artisanId: number;
    factureId: number;
    clientId: number;
    clientEmail: string;
    clientName: string;
    factureNumero: string;
    totalTTC: string;
  }) => Promise<void>;
}

export interface ConnectWebhookResult {
  readonly http: number;
  readonly body: Record<string, unknown>;
}

export async function processConnectWebhook(
  deps: ConnectWebhookDeps,
  input: { rawBody: Buffer; signature: string | undefined },
): Promise<ConnectWebhookResult> {
  if (!input.signature) return { http: 400, body: { error: "Missing signature" } };
  if (!deps.webhookSecret) return { http: 500, body: { error: "Webhook not configured" } };

  let event;
  try {
    event = await deps.stripe.constructEvent(input.rawBody, input.signature, deps.webhookSecret);
  } catch {
    /* ponytail: best-effort — signature invalide → 400 */
    return { http: 400, body: { error: "Webhook signature verification failed" } };
  }

  deps.log?.info({ event: "stripe_connect_webhook_received", stripeEvent: event.type, eventId: event.id, accountId: event.account }, `Connect webhook: ${event.type}`);

  try {
    if (event.type === "account.updated") {
      /* event.account et data.object.id portent tous deux l'account ID pour account.updated */
      const acctId = event.account ?? (typeof event.data.object["id"] === "string" ? event.data.object["id"] : null);
      if (acctId) await deps.writer.upsertConnectStatus(acctId, event.data.object);
    } else if (event.type === "account.application.deauthorized") {
      /* Pour deauthorized, event.account est la seule source fiable de l'account ID */
      if (event.account) await deps.writer.resetConnectStatus(event.account);
    } else if (event.type === "checkout.session.completed" && deps.paymentWriter) {
      await handleConnectCheckoutCompleted(deps as ConnectWebhookDeps & { paymentWriter: WebhookPaymentWriter }, event.data.object);
    } else if (event.type === "payment_intent.payment_failed" && deps.paymentWriter) {
      await handleConnectPaymentFailed(deps as ConnectWebhookDeps & { paymentWriter: WebhookPaymentWriter }, event.data.object);
    }
  } catch (err) {
    deps.log?.error({ event: "stripe_connect_webhook_error", stripeEvent: event.type, error: err instanceof Error ? err.message : String(err) }, "Connect webhook handler error");
    return { http: 500, body: { error: "Internal error" } };
  }

  return { http: 200, body: { received: true } };
}

async function handleConnectCheckoutCompleted(
  deps: ConnectWebhookDeps & { paymentWriter: WebhookPaymentWriter },
  session: Record<string, unknown>,
): Promise<void> {
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  const token = metadata.token_paiement ? String(metadata.token_paiement) : null;
  if (!token || !metadata.facture_id) {
    deps.log?.warn({ event: "connect_checkout_no_token", metadata }, "Connect checkout.session.completed sans token_paiement ou facture_id — skip");
    return;
  }
  const resolved = await deps.paymentWriter.resolvePaiement(token);
  if (!resolved) {
    deps.log?.warn({ event: "connect_checkout_resolve_null", token }, "Connect checkout.session.completed — resolvePaiement retourne null pour le token");
    return;
  }
  const { transitioned } = await deps.paymentWriter.completeCheckout({
    artisanId: resolved.artisanId,
    paiementId: resolved.paiementId,
    factureId: resolved.factureId,
    stripePaymentIntentId: session.payment_intent ? String(session.payment_intent) : "",
  });
  deps.log?.info({ event: "connect_checkout_completed", artisanId: resolved.artisanId, factureId: resolved.factureId }, `Paiement portail Connect complété (artisan ${resolved.artisanId})`);
  await deps.genererEcrituresFacture?.(resolved.artisanId, resolved.factureId).catch((err: unknown) => {
    deps.log?.error({ event: "connect_checkout_ecritures_error", factureId: resolved.factureId, error: err instanceof Error ? err.message : String(err) }, "Erreur genererEcritures après paiement Connect (best-effort compta)");
  });

  const clientEmail = typeof metadata.customer_email === "string" && metadata.customer_email ? metadata.customer_email : null;
  if (clientEmail && deps.onCheckoutCompletedEmail && transitioned) {
    const clientId = typeof metadata.user_id === "string" ? Number(metadata.user_id) : 0;
    const clientName = typeof metadata.customer_name === "string" ? metadata.customer_name : "";
    const factureNumero = typeof metadata.numero_facture === "string" ? metadata.numero_facture : "";
    const amountCents = typeof session.amount_total === "number" ? session.amount_total : null;
    const totalTTC = amountCents != null ? `${(amountCents / 100).toFixed(2)} €` : "";
    await deps.onCheckoutCompletedEmail({ artisanId: resolved.artisanId, factureId: resolved.factureId, clientId, clientEmail, clientName, factureNumero, totalTTC }).catch((err: unknown) => {
      deps.log?.error({ event: "connect_checkout_email_client_error", artisanId: resolved.artisanId, factureId: resolved.factureId, error: err instanceof Error ? err.message : String(err) }, "Email confirmation client paiement Connect échoué");
    });
  }
}

async function handleConnectPaymentFailed(
  deps: ConnectWebhookDeps & { paymentWriter: WebhookPaymentWriter },
  pi: Record<string, unknown>,
): Promise<void> {
  const metadata = (pi.metadata ?? {}) as Record<string, unknown>;
  const token = metadata.token_paiement ? String(metadata.token_paiement) : null;
  if (!token) return;
  const resolved = await deps.paymentWriter.resolvePaiement(token);
  if (!resolved) return;
  await deps.paymentWriter.failPaiement({ artisanId: resolved.artisanId, paiementId: resolved.paiementId });
  deps.log?.warn({ event: "connect_payment_failed", artisanId: resolved.artisanId, paiementId: resolved.paiementId }, `Paiement Stripe Connect échoué (artisan ${resolved.artisanId})`);
}

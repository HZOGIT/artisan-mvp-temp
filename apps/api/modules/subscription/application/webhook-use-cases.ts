import type { StripePort } from "../../../shared/ports/stripe";
import type { AppLogger } from "../../../shared/ports/logger";
import type { WebhookPaymentWriter } from "./webhook-payment-writer";
import type { SubscriptionEventNotifier } from "./subscription-event-notifier";
import { subscriptionEmail } from "../domain/webhook";

export interface StripeWebhookDeps {
  readonly stripe: StripePort;
  readonly paymentWriter: WebhookPaymentWriter;
  readonly notifier: SubscriptionEventNotifier;
  readonly webhookSecret: string;
  readonly appUrl: string;
  readonly log?: AppLogger;
  readonly onBillingWebhookEvent?: (eventType: string, paymentIntentId: string, failureCode?: string | null, failureMessage?: string | null, stripeEventId?: string) => Promise<void>;
  /**
   * Garde idempotence Stripe (at-least-once). INSERT ON CONFLICT DO NOTHING → false si déjà vu.
   * Non fourni = pas de dédup (mode test, hors-billing).
   */
  readonly markWebhookProcessed?: (eventId: string, eventType: string) => Promise<boolean>;
}

export interface WebhookResult {
  readonly http: number;
  readonly body: Record<string, unknown>;
}

export async function processStripeWebhook(
  deps: StripeWebhookDeps,
  input: { rawBody: Buffer; signature: string | undefined },
): Promise<WebhookResult> {
  if (!input.signature) return { http: 400, body: { error: "Missing signature" } };
  if (!deps.webhookSecret) return { http: 500, body: { error: "Webhook not configured" } };

  let event;
  try {
    event = await deps.stripe.constructEvent(input.rawBody, input.signature, deps.webhookSecret);
  } catch {
    return { http: 400, body: { error: "Webhook signature verification failed" } };
  }

  if (event.id.startsWith("evt_test_")) return { http: 200, body: { verified: true } };

  if (deps.markWebhookProcessed) {
    const isNew = await deps.markWebhookProcessed(event.id, event.type);
    if (!isNew) return { http: 200, body: { received: true, duplicate: true } };
  }

  deps.log?.info({ event: "stripe_webhook_received", stripeEvent: event.type, eventId: event.id }, `Stripe webhook: ${event.type}`);

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(deps, event.data.object);
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(deps, event.data.object);
      if (deps.onBillingWebhookEvent) {
        const pi = event.data.object as Record<string, unknown>;
        const piId = typeof pi["id"] === "string" ? pi["id"] : "";
        const lec = pi["last_payment_error"] as Record<string, unknown> | undefined;
        await deps.onBillingWebhookEvent(event.type, piId, lec?.["code"] as string ?? null, lec?.["message"] as string ?? null, event.id).catch((err) => {
          deps.log?.error({ event: "billing_webhook_handler_error", stripeEvent: event.type, paymentIntentId: piId, error: err instanceof Error ? err.message : String(err) }, "billing maison webhook handler failed — event not processed");
        });
      }
    } else if (event.type === "payment_intent.succeeded") {
      if (deps.onBillingWebhookEvent) {
        const pi = event.data.object as Record<string, unknown>;
        const piId = typeof pi["id"] === "string" ? pi["id"] : "";
        await deps.onBillingWebhookEvent(event.type, piId, null, null, event.id).catch((err) => {
          deps.log?.error({ event: "billing_webhook_handler_error", stripeEvent: event.type, paymentIntentId: piId, error: err instanceof Error ? err.message : String(err) }, "billing maison webhook handler failed — event not processed");
        });
      }
    } else if (event.type === "customer.subscription.trial_will_end") {
      await handleTrialWillEnd(deps, event.data.object);
    }
    return { http: 200, body: { received: true } };
  } catch (e) {
    deps.log?.error({ event: "stripe_webhook_handler_error", stripeEvent: event.type, error: e instanceof Error ? e.message : String(e) }, "Stripe webhook handler failed");
    return { http: 500, body: { error: "Webhook handler failed" } };
  }
}

async function handleCheckoutCompleted(deps: StripeWebhookDeps, session: Record<string, unknown>): Promise<void> {
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  const token = metadata.token_paiement ? String(metadata.token_paiement) : null;
  if (!token || !metadata.facture_id) return;
  const resolved = await deps.paymentWriter.resolvePaiement(token);
  if (!resolved) return;
  await deps.paymentWriter.completeCheckout({
    artisanId: resolved.artisanId,
    paiementId: resolved.paiementId,
    factureId: resolved.factureId,
    stripePaymentIntentId: session.payment_intent ? String(session.payment_intent) : "",
  });
  deps.log?.info({ event: "stripe_checkout_completed", artisanId: resolved.artisanId, factureId: resolved.factureId }, `Paiement portail complété (artisan ${resolved.artisanId})`);
}

async function handlePaymentFailed(deps: StripeWebhookDeps, pi: Record<string, unknown>): Promise<void> {
  const metadata = (pi.metadata ?? {}) as Record<string, unknown>;
  const token = metadata.token_paiement ? String(metadata.token_paiement) : null;
  if (!token) return;
  const resolved = await deps.paymentWriter.resolvePaiement(token);
  if (!resolved) return;
  await deps.paymentWriter.failPaiement({ artisanId: resolved.artisanId, paiementId: resolved.paiementId });
  deps.log?.warn({ event: "stripe_payment_failed", artisanId: resolved.artisanId, paiementId: resolved.paiementId }, `Paiement Stripe échoué (artisan ${resolved.artisanId})`);
}

async function handleTrialWillEnd(deps: StripeWebhookDeps, sub: Record<string, unknown>): Promise<void> {
  const metadata = (sub.metadata ?? {}) as Record<string, unknown>;
  const artisanId = metadata.artisanId ? Number(metadata.artisanId) : null;
  if (!artisanId) return;
  try {
    await deps.notifier.notifyArtisan(artisanId, { type: "info", titre: "Essai gratuit bientot termine", message: "Votre essai gratuit se termine dans 3 jours. Choisissez un plan pour continuer.", lien: "/parametres?tab=abonnement" });
    await deps.notifier.emailArtisanOwner(
      artisanId,
      "Votre essai Operioz se termine dans 3 jours",
      subscriptionEmail({ title: "Plus que 3 jours d'essai gratuit", body: "Votre periode d'essai Operioz se termine bientot. Choisissez votre plan pour continuer a beneficier de toutes les fonctionnalites sans interruption. Vos donnees sont conservees.", ctaLabel: "Choisir mon plan", ctaUrl: `${deps.appUrl}/parametres?tab=abonnement` }),
    );
  } catch { /* best-effort */ }
}

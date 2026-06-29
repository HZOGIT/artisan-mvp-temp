import { Counter } from "prom-client";
import type { StripePort } from "../../../shared/ports/stripe";
import type { AppLogger } from "../../../shared/ports/logger";
import type { WebhookPaymentWriter } from "./webhook-payment-writer";
import type { SubscriptionEventNotifier } from "./subscription-event-notifier";
import type { EventBusPort } from "../../../shared/ports/event-bus";
import { subscriptionEmail } from "../domain/webhook";

const stripeWebhookCounter = new Counter({
  name: "stripe_webhook_total",
  help: "Webhooks Stripe par type d'event et résultat",
  labelNames: ["event_type", "status"],
});

const stripePaymentCounter = new Counter({
  name: "stripe_payment_total",
  help: "Paiements Stripe par résultat",
  labelNames: ["status"],
});

export interface StripeWebhookDeps {
  readonly stripe: StripePort;
  readonly paymentWriter: WebhookPaymentWriter;
  readonly notifier: SubscriptionEventNotifier;
  readonly webhookSecret: string;
  readonly appUrl: string;
  readonly log?: AppLogger;
  readonly onBillingWebhookEvent?: (eventType: string, paymentIntentId: string, failureCode?: string | null, failureMessage?: string | null, stripeEventId?: string) => Promise<void>;
  /**
   * Callback déclenché sur customer.subscription.created/updated/deleted.
   * Reçoit l'artisanId, le priceId Stripe (null si deleted), et le statut Stripe brut.
   * Le mapping planId + normalisation statut est à la charge du câblage (app.ts).
   */
  readonly onSubscriptionWebhookEvent?: (artisanId: number, priceId: string | null, stripeStatus: string) => Promise<void>;
  /**
   * Garde idempotence Stripe (at-least-once). INSERT ON CONFLICT DO NOTHING → false si déjà vu.
   * Non fourni = pas de dédup (mode test, hors-billing).
   */
  readonly markWebhookProcessed?: (eventId: string, eventType: string) => Promise<boolean>;
  /**
   * Génère les écritures vente + encaissement après paiement portail.
   * Best-effort : une erreur compta ne doit pas annuler le paiement déjà confirmé.
   */
  readonly genererEcrituresFacture?: (artisanId: number, factureId: number) => Promise<void>;
  readonly eventBus?: EventBusPort;
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

  /*
   * Garde idempotence top-level — UNIQUEMENT pour les events sans dédup interne.
   * payment_intent.* délèguent à handleBillingWebhookEvent qui a son propre markWebhookProcessed.
   * Leur appliquer ce garde consommerait le slot PK → le handler billing verrait CONFLICT dès la
   * 1ère livraison → return early → cycle jamais avancé, dunning silencieusement cassé.
   */
  const EVENTS_WITH_OWN_DEDUP = ["payment_intent.succeeded", "payment_intent.payment_failed"];
  if (deps.markWebhookProcessed && !EVENTS_WITH_OWN_DEDUP.includes(event.type)) {
    const isNew = await deps.markWebhookProcessed(event.id, event.type);
    if (!isNew) {
      stripeWebhookCounter.inc({ event_type: event.type, status: "ignored" });
      return { http: 200, body: { received: true, duplicate: true } };
    }
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
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      await handleSubscriptionUpsert(deps, event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(deps, event.data.object);
    }
    stripeWebhookCounter.inc({ event_type: event.type, status: "success" });
    return { http: 200, body: { received: true } };
  } catch (e) {
    deps.log?.error({ event: "stripe_webhook_handler_error", stripeEvent: event.type, error: e instanceof Error ? e.message : String(e) }, "Stripe webhook handler failed");
    stripeWebhookCounter.inc({ event_type: event.type, status: "error" });
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
  await deps.genererEcrituresFacture?.(resolved.artisanId, resolved.factureId).catch(() => {});
  void deps.eventBus?.publish({ type: "facture.payee", aggregateType: "facture", aggregateId: resolved.factureId, artisanId: resolved.artisanId, userId: null, occurredAt: new Date(), payload: { factureId: resolved.factureId } });
  stripePaymentCounter.inc({ status: "succeeded" });
  deps.log?.info({ event: "stripe_checkout_completed", artisanId: resolved.artisanId, factureId: resolved.factureId }, `Paiement portail complété (artisan ${resolved.artisanId})`);
  try {
    await deps.notifier.notifyArtisan(resolved.artisanId, {
      type: "succes",
      titre: "Paiement reçu",
      message: "La facture a été réglée par le client.",
      lien: `/factures/${resolved.factureId}`,
    });
  } catch { /* best-effort */ }
}

async function handlePaymentFailed(deps: StripeWebhookDeps, pi: Record<string, unknown>): Promise<void> {
  const metadata = (pi.metadata ?? {}) as Record<string, unknown>;
  const token = metadata.token_paiement ? String(metadata.token_paiement) : null;
  if (!token) return;
  const resolved = await deps.paymentWriter.resolvePaiement(token);
  if (!resolved) return;
  await deps.paymentWriter.failPaiement({ artisanId: resolved.artisanId, paiementId: resolved.paiementId });
  stripePaymentCounter.inc({ status: "failed" });
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

async function handleSubscriptionUpsert(deps: StripeWebhookDeps, sub: Record<string, unknown>): Promise<void> {
  if (!deps.onSubscriptionWebhookEvent) return;
  const metadata = (sub.metadata ?? {}) as Record<string, unknown>;
  const artisanId = metadata.artisanId ? Number(metadata.artisanId) : null;
  if (!artisanId) return;
  const items = sub.items as { data: Array<{ price?: { id?: string } }> } | undefined;
  const priceId = items?.data[0]?.price?.id ?? null;
  const stripeStatus = typeof sub.status === "string" ? sub.status : "active";
  await deps.onSubscriptionWebhookEvent(artisanId, priceId, stripeStatus);
}

async function handleSubscriptionDeleted(deps: StripeWebhookDeps, sub: Record<string, unknown>): Promise<void> {
  if (!deps.onSubscriptionWebhookEvent) return;
  const metadata = (sub.metadata ?? {}) as Record<string, unknown>;
  const artisanId = metadata.artisanId ? Number(metadata.artisanId) : null;
  if (!artisanId) return;
  await deps.onSubscriptionWebhookEvent(artisanId, null, "canceled");
  void deps.eventBus?.publish({ type: "abonnement.expire", aggregateType: "abonnement", aggregateId: artisanId, artisanId, userId: null, occurredAt: new Date() });
}

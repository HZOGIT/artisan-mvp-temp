import type { StripePort } from "../../../shared/ports/stripe";
import {
  artisanIdFromMetadata,
  mapSubscriptionUpsert,
  deletedUpsertFields,
  subscriptionEmail,
} from "../domain/webhook";
import type { SubscriptionWebhookWriter } from "./subscription-webhook-writer";
import type { WebhookPaymentWriter } from "./webhook-payment-writer";
import type { SubscriptionEventNotifier } from "./subscription-event-notifier";

// Dépendances du traitement webhook Stripe. `webhookSecret` injecté (jamais lu à vide).
export interface StripeWebhookDeps {
  readonly stripe: StripePort;
  readonly writer: SubscriptionWebhookWriter;
  readonly paymentWriter: WebhookPaymentWriter;
  readonly notifier: SubscriptionEventNotifier;
  readonly webhookSecret: string;
  readonly appUrl: string;
}

// Résultat HTTP du traitement (le routeur le mappe en réponse Fastify). `body` est sérialisé JSON.
export interface WebhookResult {
  readonly http: number;
  readonly body: Record<string, unknown>;
}

// Évènements abonnement gérés à ce stade (slice A). Les évènements paiement/facture (checkout.session,
// invoice.*, payment_intent.*) sont à porter avant de router le webhook vers le new-stack (slice B).
const SUBSCRIPTION_UPSERT = new Set(["customer.subscription.created", "customer.subscription.updated"]);

// `POST /api/stripe/webhook` (parité legacy) : vérif signature **fail-closed** puis sync `subscriptions`.
// - pas de signature → 400 ; secret non configuré → **500 (refus, jamais vérifier à vide)** ; signature
//   invalide → 400 ; event de test (`evt_test_`) → 200 {verified} ; sinon dispatch + 200 {received}.
export async function processStripeWebhook(
  deps: StripeWebhookDeps,
  input: { rawBody: Buffer; signature: string | undefined },
): Promise<WebhookResult> {
  if (!input.signature) return { http: 400, body: { error: "Missing signature" } };
  // OPE-79 fail-closed : sans secret, ne JAMAIS vérifier à clé vide (signature forgeable).
  if (!deps.webhookSecret) return { http: 500, body: { error: "Webhook not configured" } };

  let event;
  try {
    event = await deps.stripe.constructEvent(input.rawBody, input.signature, deps.webhookSecret);
  } catch {
    return { http: 400, body: { error: "Webhook signature verification failed" } };
  }

  if (event.id.startsWith("evt_test_")) return { http: 200, body: { verified: true } };

  try {
    if (SUBSCRIPTION_UPSERT.has(event.type)) {
      await handleUpsert(deps, event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      await handleDeleted(deps, event.data.object);
    } else if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(deps, event.data.object);
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(deps, event.data.object);
    } else if (event.type === "invoice.payment_succeeded") {
      await handleInvoicePaid(deps, event.data.object);
    } else if (event.type === "invoice.payment_failed") {
      await handleInvoiceFailed(deps, event.data.object);
    } else if (event.type === "customer.subscription.trial_will_end") {
      await handleTrialWillEnd(deps, event.data.object);
    }
    // Tous les events legacy sont désormais gérés (abonnement + paiement/facture + invoice + trial).
    return { http: 200, body: { received: true } };
  } catch {
    return { http: 500, body: { error: "Webhook handler failed" } };
  }
}

async function resolveArtisanId(deps: StripeWebhookDeps, sub: Record<string, unknown>): Promise<number | null> {
  const fromMeta = artisanIdFromMetadata(sub.metadata as Record<string, unknown> | undefined);
  if (fromMeta) return fromMeta;
  const customerId = sub.customer as string | undefined;
  return customerId ? deps.writer.getArtisanIdByCustomerId(customerId) : null;
}

async function handleUpsert(deps: StripeWebhookDeps, sub: Record<string, unknown>): Promise<void> {
  const artisanId = await resolveArtisanId(deps, sub);
  if (!artisanId) return; // artisanId introuvable → skip (parité legacy)
  await deps.writer.applyUpsert(artisanId, mapSubscriptionUpsert(sub));
}

async function handleDeleted(deps: StripeWebhookDeps, sub: Record<string, unknown>): Promise<void> {
  const artisanId = await resolveArtisanId(deps, sub);
  if (!artisanId) return;
  await deps.writer.applyDeleted(artisanId, deletedUpsertFields());
}

// `checkout.session.completed` (parité legacy) : paiement par token → facture payée + notification.
// Métadonnées requises (token_paiement + facture_id) sinon skip. Le paiement est résolu par token
// (capacité), l'artisanId/factureId viennent du paiement (source de vérité, pas du metadata).
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
}

// `payment_intent.payment_failed` (parité legacy) : paiement par token → echoue.
async function handlePaymentFailed(deps: StripeWebhookDeps, pi: Record<string, unknown>): Promise<void> {
  const metadata = (pi.metadata ?? {}) as Record<string, unknown>;
  const token = metadata.token_paiement ? String(metadata.token_paiement) : null;
  if (!token) return;
  const resolved = await deps.paymentWriter.resolvePaiement(token);
  if (!resolved) return;
  await deps.paymentWriter.failPaiement({ artisanId: resolved.artisanId, paiementId: resolved.paiementId });
}

// Notifs/emails best-effort : ne JAMAIS faire échouer le webhook (parité legacy).
async function bestEffort(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    /* best-effort */
  }
}

// `invoice.payment_succeeded` (parité legacy) : SEULEMENT pour une facture d'abonnement. Recharge la
// subscription Stripe (period dates à jour) → status active + period. Email best-effort.
async function handleInvoicePaid(deps: StripeWebhookDeps, invoice: Record<string, unknown>): Promise<void> {
  const subscriptionId = invoice.subscription ? String(invoice.subscription) : null;
  const customerId = invoice.customer ? String(invoice.customer) : null;
  if (!subscriptionId || !customerId) return;
  const artisanId = await deps.writer.getArtisanIdByCustomerId(customerId);
  if (!artisanId) return;

  const sub = await deps.stripe.retrieveSubscription(subscriptionId);
  await deps.writer.setStatusAndPeriod(artisanId, { status: "active", currentPeriodStart: sub.currentPeriodStart, currentPeriodEnd: sub.currentPeriodEnd });

  await bestEffort(async () => {
    const periodLabel = sub.currentPeriodEnd ? sub.currentPeriodEnd.toLocaleDateString("fr-FR") : "—";
    await deps.notifier.emailArtisanOwner(
      artisanId,
      "Paiement confirme — Bienvenue sur Operioz",
      subscriptionEmail({ title: "Paiement confirme", body: `Merci ! Votre abonnement Operioz est actif. Prochain renouvellement le ${periodLabel}.`, ctaLabel: "Acceder a mon espace", ctaUrl: `${deps.appUrl}/dashboard` }),
    );
  });
}

// `invoice.payment_failed` (parité legacy) : facture d'abonnement → past_due + notif erreur + email.
async function handleInvoiceFailed(deps: StripeWebhookDeps, invoice: Record<string, unknown>): Promise<void> {
  const subscriptionId = invoice.subscription ? String(invoice.subscription) : null;
  const customerId = invoice.customer ? String(invoice.customer) : null;
  if (!subscriptionId || !customerId) return;
  const artisanId = await deps.writer.getArtisanIdByCustomerId(customerId);
  if (!artisanId) return;

  await deps.writer.setStatus(artisanId, "past_due");
  await bestEffort(async () => {
    await deps.notifier.notifyArtisan(artisanId, { type: "erreur", titre: "Paiement echoue", message: "Votre dernier paiement Operioz a echoue. Mettez a jour votre carte pour eviter la suspension.", lien: "/parametres?tab=abonnement" });
    await deps.notifier.emailArtisanOwner(
      artisanId,
      "Probleme de paiement — Action requise",
      subscriptionEmail({ title: "Echec de paiement", body: "Le paiement de votre abonnement Operioz n'a pas pu etre effectue. Merci de mettre a jour votre moyen de paiement sous 7 jours pour eviter une suspension du service.", ctaLabel: "Mettre a jour ma carte", ctaUrl: `${deps.appUrl}/parametres?tab=abonnement` }),
    );
  });
}

// `customer.subscription.trial_will_end` (parité legacy, J-3) : notif info + email rappel (best-effort).
async function handleTrialWillEnd(deps: StripeWebhookDeps, sub: Record<string, unknown>): Promise<void> {
  const artisanId = await resolveArtisanId(deps, sub);
  if (!artisanId) return;
  await bestEffort(async () => {
    await deps.notifier.notifyArtisan(artisanId, { type: "info", titre: "Essai gratuit bientot termine", message: "Votre essai gratuit se termine dans 3 jours. Choisissez un plan pour continuer.", lien: "/parametres?tab=abonnement" });
    await deps.notifier.emailArtisanOwner(
      artisanId,
      "Votre essai Operioz se termine dans 3 jours",
      subscriptionEmail({ title: "Plus que 3 jours d'essai gratuit", body: "Votre periode d'essai Operioz se termine bientot. Choisissez votre plan pour continuer a beneficier de toutes les fonctionnalites sans interruption. Vos donnees sont conservees.", ctaLabel: "Choisir mon plan", ctaUrl: `${deps.appUrl}/parametres?tab=abonnement` }),
    );
  });
}

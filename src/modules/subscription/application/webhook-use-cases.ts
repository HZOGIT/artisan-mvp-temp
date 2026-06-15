import type { StripePort } from "../../../shared/ports/stripe";
import {
  artisanIdFromMetadata,
  mapSubscriptionUpsert,
  deletedUpsertFields,
} from "../domain/webhook";
import type { SubscriptionWebhookWriter } from "./subscription-webhook-writer";

// Dépendances du traitement webhook Stripe (abonnement). `webhookSecret` injecté (jamais lu à vide).
export interface StripeWebhookDeps {
  readonly stripe: StripePort;
  readonly writer: SubscriptionWebhookWriter;
  readonly webhookSecret: string;
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
    }
    // Autres types (checkout.session/invoice/payment_intent/trial_will_end…) : no-op à ce stade
    // (slice B). Le webhook ne sera routé vers le new-stack qu'une fois tous les events portés.
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

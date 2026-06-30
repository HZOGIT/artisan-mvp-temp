import { Counter } from "prom-client";
import type { StripePort } from "../../../shared/ports/stripe";
import type { AppLogger } from "../../../shared/ports/logger";
import type { WebhookPaymentWriter } from "./webhook-payment-writer";
import type { SubscriptionEventNotifier } from "./subscription-event-notifier";
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
  /**
   * Email de confirmation de paiement envoyé au client après checkout.session.completed.
   * Best-effort : l'erreur est loggée mais ne bloque pas la confirmation du paiement.
   * clientId = metadata.user_id (accès portail client).
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

export interface WebhookResult {
  readonly http: number;
  readonly body: Record<string, unknown>;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Corps HTML de l'email de confirmation de paiement envoyé au client (pur, testable). */
export function buildPaiementConfirmationEmail(params: {
  artisanName: string;
  clientName: string;
  factureNumero: string;
  totalTTC: string;
  portalUrl?: string | null;
}): { subject: string; body: string } {
  const { artisanName, clientName, factureNumero, totalTTC, portalUrl } = params;
  const subject = `Confirmation de paiement - Facture ${factureNumero}`;
  const portalButton = portalUrl
    ? `<tr><td style="padding:16px 40px 36px 40px;text-align:center;">
          <a href="${portalUrl}" style="display:inline-block;background-color:#16a34a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;">Consulter ma facture</a>
       </td></tr>`
    : `<tr><td style="padding:0 40px 36px 40px;"></td></tr>`;
  const body = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#16a34a;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${escapeHtml(artisanName)}</h1>
        </td></tr>
        <tr><td style="padding:36px 40px 16px 40px;">
          <p style="margin:0 0 20px 0;font-size:16px;color:#1f2937;line-height:1.6;">Bonjour ${escapeHtml(clientName)},</p>
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">Votre paiement a bien été reçu. Merci !</p>
        </td></tr>
        <tr><td style="padding:0 40px 28px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
            <tr><td style="padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;width:45%;">Numéro de facture</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${escapeHtml(factureNumero)}</td></tr>
                <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;border-top:1px solid #bbf7d0;">Montant payé</td><td style="padding:6px 0;font-size:16px;color:#16a34a;font-weight:700;text-align:right;border-top:1px solid #bbf7d0;">${escapeHtml(totalTTC)}</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        ${portalButton}
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, body };
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
    /* ponytail: best-effort — signature invalide → 400 */
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
  await deps.genererEcrituresFacture?.(resolved.artisanId, resolved.factureId).catch(() => { /* ponytail: best-effort — écritures diff (non-bloquant pour le paiement) */ });
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

  const clientEmail = typeof metadata.customer_email === "string" && metadata.customer_email ? metadata.customer_email : null;
  if (clientEmail && deps.onCheckoutCompletedEmail) {
    const clientId = typeof metadata.user_id === "string" ? Number(metadata.user_id) : 0;
    const clientName = typeof metadata.customer_name === "string" ? metadata.customer_name : "";
    const factureNumero = typeof metadata.numero_facture === "string" ? metadata.numero_facture : "";
    const amountCents = typeof session.amount_total === "number" ? session.amount_total : null;
    const totalTTC = amountCents != null ? `${(amountCents / 100).toFixed(2)} €` : "";
    await deps.onCheckoutCompletedEmail({ artisanId: resolved.artisanId, factureId: resolved.factureId, clientId, clientEmail, clientName, factureNumero, totalTTC }).catch((err: unknown) => {
      deps.log?.error({ event: "checkout_email_client_error", artisanId: resolved.artisanId, factureId: resolved.factureId, error: err instanceof Error ? err.message : String(err) }, "Email confirmation client paiement échoué");
    });
  }
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
}

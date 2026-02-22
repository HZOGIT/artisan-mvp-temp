import Stripe from 'stripe';
import { ENV } from '../_core/env';
import { STRIPE_CONFIG, getInvoiceProductName, getInvoiceProductDescription } from './products';

// Lazy Stripe initialization — avoids crash if STRIPE_SECRET_KEY not yet loaded
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    // Read directly from process.env at call time (ENV caches at module load)
    const key = process.env.STRIPE_SECRET_KEY || ENV.stripeSecretKey || '';
    if (!key) {
      // Log available STRIPE-related env vars for diagnosis
      const stripeVars = Object.keys(process.env).filter(k => k.toUpperCase().includes('STRIPE'));
      console.error('[Stripe] STRIPE_SECRET_KEY missing. Available STRIPE vars:', stripeVars);
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    _stripe = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return _stripe;
}

// For webhook signature verification, we only need the webhooks helper —
// create a minimal instance if the full key is missing
function getWebhooksHelper(): Stripe {
  // For constructEvent, any non-empty key works — the secret key is not used,
  // only the webhook signing secret matters
  if (_stripe) return _stripe;
  const key = ENV.stripeSecretKey || process.env.STRIPE_SECRET_KEY || 'sk_placeholder_for_webhook_verify';
  return new Stripe(key, { apiVersion: '2025-12-15.clover' });
}

export interface CreateCheckoutSessionParams {
  factureId: number;
  numeroFacture: string;
  montantTTC: number;
  clientEmail: string;
  clientName: string;
  artisanName: string;
  artisanId: number;
  userId: number;
  origin: string;
  tokenPaiement: string;
  portalToken: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

/**
 * Crée une session de paiement Stripe Checkout pour une facture
 */
export async function createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
  const {
    factureId,
    numeroFacture,
    montantTTC,
    clientEmail,
    clientName,
    artisanName,
    artisanId,
    userId,
    origin,
    tokenPaiement,
    portalToken,
  } = params;

  // Convertir le montant en centimes (Stripe utilise les centimes)
  const amountInCents = Math.round(montantTTC * 100);

  // Créer la session de paiement
  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: clientEmail,
    client_reference_id: factureId.toString(),
    allow_promotion_codes: true,
    locale: STRIPE_CONFIG.locale,
    line_items: [
      {
        price_data: {
          currency: STRIPE_CONFIG.currency,
          product_data: {
            name: getInvoiceProductName(numeroFacture),
            description: getInvoiceProductDescription(clientName, artisanName),
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      facture_id: factureId.toString(),
      artisan_id: artisanId.toString(),
      user_id: userId.toString(),
      customer_email: clientEmail,
      customer_name: clientName,
      numero_facture: numeroFacture,
      token_paiement: tokenPaiement,
    },
    success_url: `${origin}/portail/${portalToken}?paiement=succes&factureId=${factureId}`,
    cancel_url: `${origin}/portail/${portalToken}?paiement=annule`,
  });

  if (!session.url) {
    throw new Error('Impossible de créer la session de paiement');
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Récupère les détails d'une session de paiement
 */
export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  return await getStripe().checkout.sessions.retrieve(sessionId);
}

/**
 * Vérifie la signature d'un webhook Stripe
 */
export function constructWebhookEvent(
  payload: Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  return getWebhooksHelper().webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Vérifie si Stripe est configuré
 */
export function isStripeConfigured(): boolean {
  return !!(ENV.stripeSecretKey && ENV.stripeSecretKey.length > 0);
}

export { getStripe as stripe };

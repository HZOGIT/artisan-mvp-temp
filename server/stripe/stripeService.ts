import Stripe from 'stripe';
import { ENV } from '../_core/env';
import { STRIPE_CONFIG, getInvoiceProductName, getInvoiceProductDescription } from './products';

// Initialiser Stripe avec la clé secrète
const stripe = new Stripe(ENV.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover',
});

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
  } = params;

  // Convertir le montant en centimes (Stripe utilise les centimes)
  const amountInCents = Math.round(montantTTC * 100);

  // Créer la session de paiement
  const session = await stripe.checkout.sessions.create({
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
    success_url: `${origin}/paiement/succes?session_id={CHECKOUT_SESSION_ID}&token=${tokenPaiement}`,
    cancel_url: `${origin}/paiement/annule?token=${tokenPaiement}`,
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
  return await stripe.checkout.sessions.retrieve(sessionId);
}

/**
 * Vérifie la signature d'un webhook Stripe
 */
export function constructWebhookEvent(
  payload: Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Vérifie si Stripe est configuré
 */
export function isStripeConfigured(): boolean {
  return !!(ENV.STRIPE_SECRET_KEY && ENV.STRIPE_SECRET_KEY.length > 0);
}

export { stripe };

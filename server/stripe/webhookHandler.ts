import { Request, Response } from 'express';
import { constructWebhookEvent } from './stripeService';
import { ENV } from '../_core/env';
import * as db from '../db';

/**
 * Gestionnaire des webhooks Stripe
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'] as string;
  
  if (!signature) {
    console.error('[Stripe Webhook] Missing signature');
    return res.status(400).json({ error: 'Missing signature' });
  }

  let event;
  
  try {
    event = constructWebhookEvent(
      req.body,
      signature,
      ENV.stripeWebhookSecret || ''
    );
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Détecter les événements de test
  if (event.id.startsWith('evt_test_')) {
    console.log('[Stripe Webhook] Test event detected, returning verification response');
    return res.json({ verified: true });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        await handleCheckoutSessionCompleted(session);
        break;
      }
      
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as any;
        console.log(`[Stripe Webhook] Payment succeeded: ${paymentIntent.id}`);
        break;
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as any;
        console.log(`[Stripe Webhook] Payment failed: ${paymentIntent.id}`);
        await handlePaymentFailed(paymentIntent);
        break;
      }
      
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error: any) {
    console.error('[Stripe Webhook] Error processing event:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

/**
 * Traite une session de paiement complétée
 */
async function handleCheckoutSessionCompleted(session: any) {
  console.log(`[Stripe Webhook] Checkout session completed: ${session.id}`);
  
  const tokenPaiement = session.metadata?.token_paiement;
  const factureId = session.metadata?.facture_id;
  
  if (!tokenPaiement || !factureId) {
    console.error('[Stripe Webhook] Missing metadata in session');
    return;
  }

  // Récupérer le paiement par token
  const paiement = await db.getPaiementByToken(tokenPaiement);
  
  if (!paiement) {
    console.error(`[Stripe Webhook] Payment not found for token: ${tokenPaiement}`);
    return;
  }

  // Mettre à jour le paiement comme complété
  await db.markPaiementComplete(paiement.id, session.payment_intent || '');
  
  // Mettre à jour le statut de la facture
  await db.updateFacture(parseInt(factureId), {
    statut: 'payee',
    datePaiement: new Date(),
  });

  // Créer une notification pour l'artisan
  const facture = await db.getFactureById(parseInt(factureId));
  if (facture) {
    await db.createNotification({
      artisanId: facture.artisanId,
      type: 'succes',
      titre: 'Paiement reçu',
      message: `Le paiement de la facture ${facture.numero} a été reçu (${Number(facture.totalTTC).toFixed(2)} €)`,
      lien: `/factures/${facture.id}`,
    });
  }

  console.log(`[Stripe Webhook] Payment completed for invoice ${factureId}`);
}

/**
 * Traite un paiement échoué
 */
async function handlePaymentFailed(paymentIntent: any) {
  const tokenPaiement = paymentIntent.metadata?.token_paiement;
  
  if (!tokenPaiement) {
    return;
  }

  const paiement = await db.getPaiementByToken(tokenPaiement);
  
  if (paiement) {
    await db.updatePaiementStripe(paiement.id, {
      statut: 'echoue',
    });
  }
}

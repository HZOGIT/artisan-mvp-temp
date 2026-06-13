import { Request, Response } from 'express';
import { constructWebhookEvent } from './stripeService';
import { ENV } from '../_core/env';
import * as db from '../db';
import { sendEmail } from '../_core/emailService';

// Mapping plan -> limites par defaut. Garde aussi cote db.ts (PLAN_LIMITS)
// mais duplique ici pour clarte du webhook.
const PLAN_LIMITS: Record<string, { maxUsers: number; maxDevices: number; maxSessions: number }> = {
  trial:      { maxUsers: 1,  maxDevices: 3, maxSessions: 2 },
  essentiel:  { maxUsers: 1,  maxDevices: 3, maxSessions: 2 },
  pro:        { maxUsers: 3,  maxDevices: 3, maxSessions: 3 },
  entreprise: { maxUsers: 10, maxDevices: 3, maxSessions: 4 },
  expired:    { maxUsers: 0,  maxDevices: 0, maxSessions: 0 },
};

// Resoud (plan, extraUsers) depuis le metadata Stripe ou null si introuvable.
function planFromMetadata(metadata: any): { plan: string; extraUsers: number } | null {
  const plan = metadata?.plan ? String(metadata.plan).toLowerCase() : null;
  if (!plan || !PLAN_LIMITS[plan]) return null;
  const extra = metadata?.extraUsers ? parseInt(String(metadata.extraUsers), 10) : 0;
  return { plan, extraUsers: Number.isFinite(extra) ? extra : 0 };
}

// Recupere l'artisan id depuis (a) metadata.artisanId Stripe (b) customer_id
// dans notre table subscriptions (fallback robuste si metadata absent).
async function resolveArtisanId(metadata: any, customerId?: string): Promise<number | null> {
  const fromMeta = metadata?.artisanId ? parseInt(String(metadata.artisanId), 10) : NaN;
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  if (customerId) {
    const existing = await db.getSubscriptionByCustomerId(customerId);
    if (existing) return existing.artisanId;
  }
  return null;
}

/**
 * Gestionnaire des webhooks Stripe
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    console.error('[Stripe Webhook] Missing signature');
    return res.status(400).json({ error: 'Missing signature' });
  }

  // OPE-79 — fail-closed : sans secret configuré, `|| ''` passerait la clé VIDE
  // (publiquement connue) à la vérification → un attaquant pourrait forger une
  // signature valide (HMAC clé vide) et faire accepter un webhook (premium gratuit /
  // facture marquée payée). On REFUSE explicitement plutôt que de vérifier à vide.
  if (!ENV.stripeWebhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET non configuré — refus (fail-closed)');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;

  try {
    event = constructWebhookEvent(
      req.body,
      signature,
      ENV.stripeWebhookSecret
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

      // --- T2 : evenements abonnement ---
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await handleSubscriptionUpsert(event.data.object as any);
        break;
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object as any);
        break;
      }
      case 'customer.subscription.trial_will_end': {
        await handleTrialWillEnd(event.data.object as any);
        break;
      }
      case 'invoice.payment_succeeded': {
        await handleInvoicePaymentSucceeded(event.data.object as any);
        break;
      }
      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(event.data.object as any);
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
  await db.updatePaiementStripe(paiement.id, {
    statut: 'complete',
    stripePaymentIntentId: session.payment_intent || '',
    paidAt: new Date(),
  });

  // Mettre à jour le statut de la facture
  const facture = await db.getFactureById(parseInt(factureId));
  if (facture) {
    await db.updateFacture(parseInt(factureId), {
      statut: 'payee',
      datePaiement: new Date(),
      montantPaye: facture.totalTTC,
      modePaiement: 'carte',
    });

    // Créer une notification pour l'artisan
    const client = await db.getClientById(facture.clientId);
    const clientNom = client ? `${client.prenom || ''} ${client.nom}`.trim() : 'Client';
    await db.createNotification({
      artisanId: facture.artisanId,
      type: 'succes',
      titre: 'Paiement reçu en ligne',
      message: `Facture ${facture.numero} payée en ligne par ${clientNom} (${Number(facture.totalTTC).toFixed(2)} €)`,
      lien: `/factures/${facture.id}`,
    });

    console.log(`[Stripe Webhook] Payment completed for invoice ${factureId} (${facture.numero})`);
  }
}

/**
 * Traite un paiement échoué
 */
async function handlePaymentFailed(paymentIntent: any) {
  const tokenPaiement = paymentIntent.metadata?.token_paiement;

  if (!tokenPaiement) {
    console.log('[Stripe Webhook] No token_paiement in failed payment metadata');
    return;
  }

  const paiement = await db.getPaiementByToken(tokenPaiement);

  if (paiement) {
    await db.updatePaiementStripe(paiement.id, {
      statut: 'echoue',
    });
    console.log(`[Stripe Webhook] Payment marked as failed for token: ${tokenPaiement}`);
  }
}

// ============================================================================
// T2 — Handlers abonnement
// ============================================================================

/**
 * Subscription created OR updated. Stripe envoie subscription.created juste
 * apres le checkout, puis subscription.updated a chaque renouvellement /
 * changement de plan / passage trial -> active. On traite les deux pareil.
 */
async function handleSubscriptionUpsert(sub: any) {
  const customerId = sub.customer as string;
  const artisanId = await resolveArtisanId(sub.metadata, customerId);
  if (!artisanId) {
    console.warn('[Webhook] subscription.upsert : artisanId introuvable, skip');
    return;
  }

  const planInfo = planFromMetadata(sub.metadata) || { plan: 'trial', extraUsers: 0 };
  const limits = PLAN_LIMITS[planInfo.plan] || PLAN_LIMITS.trial;
  // Si extraUsers > 0, on augmente maxUsers en consequence.
  const maxUsers = limits.maxUsers + (planInfo.extraUsers || 0);

  // Determiner status interne :
  // - trialing : status Stripe trialing
  // - active   : status Stripe active OR past_due
  // - canceled : status Stripe canceled
  const stripeStatus = String(sub.status || 'active');
  const internalStatus =
    stripeStatus === 'trialing' ? 'trialing' :
    stripeStatus === 'past_due' ? 'past_due' :
    stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired' ? 'canceled' :
    'active';

  await db.updateSubscription(artisanId, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: sub.items?.data?.[0]?.price?.id,
    plan: planInfo.plan,
    status: internalStatus,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    maxUsers,
    maxDevicesPerUser: limits.maxDevices,
    maxConcurrentSessions: limits.maxSessions,
  });

  console.log(`[Webhook] Subscription upsert artisan=${artisanId} plan=${planInfo.plan} status=${internalStatus}`);
}

/**
 * Subscription deleted/expired : on bascule en plan expired pour bloquer
 * l'acces (sauf paths whitelistes par le middleware T3).
 */
async function handleSubscriptionDeleted(sub: any) {
  const customerId = sub.customer as string;
  const artisanId = await resolveArtisanId(sub.metadata, customerId);
  if (!artisanId) return;

  await db.updateSubscription(artisanId, {
    plan: 'expired',
    status: 'canceled',
    cancelAtPeriodEnd: false,
  });

  // Notifier l'artisan par email (best-effort).
  try {
    const artisan = await db.getArtisanById(artisanId);
    const user = artisan?.userId ? await db.getUserById(artisan.userId) : null;
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: 'Confirmation de resiliation Operioz',
        body: subscriptionEmail({
          title: 'Votre abonnement Operioz est resilie',
          body: `Votre abonnement a ete resilie comme demande. Vos donnees sont conservees pendant 30 jours, vous pouvez reprendre la ou vous en etiez en vous reabonnant.`,
          ctaLabel: 'Renouveler mon abonnement',
          ctaUrl: `${process.env.APP_URL || 'https://www.operioz.com'}/parametres?tab=abonnement`,
        }),
      });
    }
  } catch (e: any) {
    console.warn('[Webhook] Email resiliation non envoye:', e?.message || e);
  }

  console.log(`[Webhook] Subscription deleted artisan=${artisanId}`);
}

/**
 * Trial will end (J-3 de Stripe). On envoie un rappel email + notification.
 */
async function handleTrialWillEnd(sub: any) {
  const artisanId = await resolveArtisanId(sub.metadata, sub.customer as string);
  if (!artisanId) return;
  try {
    const artisan = await db.getArtisanById(artisanId);
    const user = artisan?.userId ? await db.getUserById(artisan.userId) : null;
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: 'Votre essai Operioz se termine dans 3 jours',
        body: subscriptionEmail({
          title: 'Plus que 3 jours d’essai gratuit',
          body: `Votre periode d’essai Operioz se termine bientot. Choisissez votre plan pour continuer a beneficier de toutes les fonctionnalites sans interruption. Vos donnees sont conservees.`,
          ctaLabel: 'Choisir mon plan',
          ctaUrl: `${process.env.APP_URL || 'https://www.operioz.com'}/parametres?tab=abonnement`,
        }),
      });
    }
    try {
      await db.createNotification({
        artisanId,
        type: 'info',
        titre: 'Essai gratuit bientot termine',
        message: 'Votre essai gratuit se termine dans 3 jours. Choisissez un plan pour continuer.',
        lien: '/parametres?tab=abonnement',
      });
    } catch {}
  } catch (e: any) {
    console.warn('[Webhook] trial_will_end notif non envoyee:', e?.message || e);
  }
}

/**
 * Invoice paid : on renouvelle current_period_end et on envoie une confirmation.
 */
async function handleInvoicePaymentSucceeded(invoice: any) {
  // On ne traite que les factures liees a une subscription (pas les paiements
  // de factures clients unitaires deja gerees par checkout.session.completed).
  if (!invoice.subscription) return;

  const customerId = invoice.customer as string;
  const existing = await db.getSubscriptionByCustomerId(customerId);
  if (!existing) return;

  // Recharger l'objet subscription Stripe pour avoir current_period_end a jour.
  try {
    const { stripe } = await import('./stripeService');
    const sub = await stripe().subscriptions.retrieve(invoice.subscription as string) as any;

    await db.updateSubscription(existing.artisanId, {
      status: 'active',
      currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    });

    // Email de confirmation (best-effort).
    const artisan = await db.getArtisanById(existing.artisanId);
    const user = artisan?.userId ? await db.getUserById(artisan.userId) : null;
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: 'Paiement confirme — Bienvenue sur Operioz',
        body: subscriptionEmail({
          title: 'Paiement confirme',
          body: `Merci ! Votre abonnement Operioz est actif. Prochain renouvellement le ${sub.current_period_end ? new Date(sub.current_period_end * 1000).toLocaleDateString('fr-FR') : '—'}.`,
          ctaLabel: 'Acceder a mon espace',
          ctaUrl: `${process.env.APP_URL || 'https://www.operioz.com'}/dashboard`,
        }),
      });
    }
  } catch (e: any) {
    console.warn('[Webhook] invoice.payment_succeeded:', e?.message || e);
  }
}

/**
 * Invoice failed : on bascule en past_due et on alerte.
 */
async function handleInvoicePaymentFailed(invoice: any) {
  if (!invoice.subscription) return;

  const customerId = invoice.customer as string;
  const existing = await db.getSubscriptionByCustomerId(customerId);
  if (!existing) return;

  await db.updateSubscription(existing.artisanId, { status: 'past_due' });

  try {
    const artisan = await db.getArtisanById(existing.artisanId);
    const user = artisan?.userId ? await db.getUserById(artisan.userId) : null;
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: 'Probleme de paiement — Action requise',
        body: subscriptionEmail({
          title: 'Echec de paiement',
          body: `Le paiement de votre abonnement Operioz n’a pas pu etre effectue. Merci de mettre a jour votre moyen de paiement sous 7 jours pour eviter une suspension du service.`,
          ctaLabel: 'Mettre a jour ma carte',
          ctaUrl: `${process.env.APP_URL || 'https://www.operioz.com'}/parametres?tab=abonnement`,
        }),
      });
    }
    try {
      await db.createNotification({
        artisanId: existing.artisanId,
        type: 'erreur',
        titre: 'Paiement echoue',
        message: 'Votre dernier paiement Operioz a echoue. Mettez a jour votre carte pour eviter la suspension.',
        lien: '/parametres?tab=abonnement',
      });
    } catch {}
  } catch (e: any) {
    console.warn('[Webhook] invoice.payment_failed:', e?.message || e);
  }
}

// Petit helper HTML pour les emails subscription (template uniforme).
function subscriptionEmail({ title, body, ctaLabel, ctaUrl }: {
  title: string; body: string; ctaLabel: string; ctaUrl: string;
}): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#2563eb;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(body)}</p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">${escapeHtml(ctaLabel)} →</a>
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">© ${new Date().getFullYear()} Operioz</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

import type { IBillingRepository } from "../../application/billing-repository";
import { nextPeriod, nextRetryAt, MAX_DUNNING_ATTEMPTS } from "../../domain/billing-cycle";
import { planById } from "../../domain/plan";

export interface BillingWebhookDeps {
  readonly repo: IBillingRepository;
}

export async function handleBillingWebhookEvent(
  deps: BillingWebhookDeps,
  eventType: string,
  paymentIntentId: string,
  failureCode?: string | null,
  failureMessage?: string | null,
  stripeEventId?: string,
): Promise<void> {
  /**
   * Deduplication : Stripe livre les webhooks "at least once".
   * ON CONFLICT DO NOTHING → retourne false si l'event est déjà traité.
   */
  if (stripeEventId) {
    const isNew = await deps.repo.markWebhookProcessed(stripeEventId, eventType, { paymentIntentId });
    if (!isNew) return;
  }

  const attempt = await deps.repo.findChargeAttemptByPaymentIntentId(paymentIntentId);
  if (!attempt) return;

  const now = new Date();

  if (eventType === "payment_intent.succeeded") {
    const cycle = await deps.repo.findCycleById(attempt.cycle_id);
    /*
     * Idempotence scheduler↔webhook (paiements synchrones carte) :
     * Le scheduler traite le PI.succeeded immédiatement et marque le cycle "paid".
     * Le webhook Stripe arrive ensuite avec un event.id distinct — markWebhookProcessed
     * le considère nouveau — et retraiterait le cycle en double (cycle.paid +
     * subscription.period_advanced dupliqués dans billing_events).
     * Guard : si le cycle est déjà "paid", le webhook est un no-op.
     */
    if (cycle?.status === "paid") return;

    await deps.repo.updateChargeAttempt(attempt.id, { status: "succeeded" });

    let artisanId: number | null = null;

    if (cycle) {
      await deps.repo.updateCycleStatus(cycle.id, { status: "paid", paidAt: now, failedAt: null, nextRetryAt: null });

      const sub = await deps.repo.findSubscriptionById(cycle.subscription_id);
      if (sub) {
        artisanId = sub.artisan_id;
        /*
         * Guard : sub annulée entre l'émission du PI et la réception du webhook (livraison
         * différée Stripe, ou processDueCancellations exécuté en parallèle).
         * Ne pas forcer status='active' ni créer le prochain cycle — cela ressusciterait
         * une sub que l'artisan a explicitement annulée.
         */
        if (sub.status !== "canceled") {
          const interval = sub.billing_interval === "yearly" ? "yearly" : "monthly";
          const { start, end } = nextPeriod(cycle.period_end, interval);
          /*
           * Cycle créé AVANT updateSubscriptionPeriod (même pattern que activateExpiredTrials).
           * Si updateSubscriptionPeriod échoue après createCycle, le scheduler retrouve
           * le cycle pending au tick suivant et le charge → auto-healing.
           */
          const existing = await deps.repo.findPendingCycleForPeriod(sub.id, start);
          if (!existing) {
            const plan = planById(sub.plan_id);
            const amountCents = plan ? plan.amountCentsByInterval[interval] : cycle.amount_cents;
            await deps.repo.createCycle({ subscriptionId: sub.id, periodStart: start, periodEnd: end, amountCents, currency: cycle.currency });
          }
          await deps.repo.updateSubscriptionPeriod(sub.id, "active", cycle.period_end, end);
          await deps.repo.appendEvent({
            entityType: "billing_subscription",
            entityId: sub.id,
            eventType: "subscription.period_advanced",
            payload: { via: "webhook", artisanId, nextPeriodStart: start.toISOString(), nextPeriodEnd: end.toISOString() },
            actor: "stripe_webhook",
          });
        }
      }
    }

    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: attempt.cycle_id,
      eventType: "cycle.paid",
      payload: { paymentIntentId, via: "webhook", artisanId, paidAt: now.toISOString() },
      actor: "stripe_webhook",
    });
  } else if (eventType === "payment_intent.payment_failed") {
    const cycle = await deps.repo.findCycleById(attempt.cycle_id);
    /*
     * Idempotence scheduler↔webhook : retour anticipé si le cycle est déjà en état terminal.
     * — "paid"   : ne pas écraser un paiement réussi avec un échec
     * — "failed" : le scheduler a déjà traité cet échec synchrone (handleDunning) ;
     *              le webhook arrivant après créerait des événements cycle.charge_failed
     *              et subscription.suspended dupliqués dans billing_events.
     */
    if (cycle?.status === "paid" || cycle?.status === "failed") return;

    await deps.repo.updateChargeAttempt(attempt.id, {
      status: "failed",
      failureCode: failureCode ?? null,
      failureMessage: failureMessage ?? null,
    });

    /* Fetch sub ici (pas seulement sur isFinalAttempt) pour artisanId uniforme dans cycle.charge_failed (FIX-BB). */
    const sub = cycle ? await deps.repo.findSubscriptionById(cycle.subscription_id) : null;
    const artisanId = sub?.artisan_id ?? null;

    const attemptCount = cycle?.attempt_count ?? attempt.attempt_no;
    const isFinalAttempt = attemptCount >= MAX_DUNNING_ATTEMPTS;
    const retryAt = isFinalAttempt ? null : nextRetryAt(now, attemptCount);
    await deps.repo.updateCycleStatus(attempt.cycle_id, { status: "failed", failedAt: now, nextRetryAt: retryAt });
    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: attempt.cycle_id,
      eventType: "cycle.charge_failed",
      payload: { paymentIntentId, via: "webhook", artisanId, attemptNo: attempt.attempt_no, failureCode, failureMessage, nextRetryAt: retryAt?.toISOString() ?? null },
      actor: "stripe_webhook",
    });
    /*
     * Guard symétrique de FIX-CE : ne pas forcer past_due si la sub est déjà canceled.
     * Exemple : SEPA en vol, processDueCancellations annule la sub, puis Stripe livre
     * payment_intent.payment_failed en retard → sans ce guard, sub "canceled" → "past_due"
     * (résurrection involontaire + notification de suspension d'un abo déjà annulé).
     */
    if (isFinalAttempt && cycle && sub && sub.status !== "canceled") {
      await deps.repo.updateSubscriptionStatus({ artisanId: sub.artisan_id, userId: 0 }, "past_due");
      await deps.repo.appendEvent({
        entityType: "billing_subscription",
        entityId: sub.id,
        eventType: "subscription.suspended",
        payload: { artisanId: sub.artisan_id, reason: "max_dunning_attempts", via: "webhook" },
        actor: "stripe_webhook",
      });
    }
  }
}

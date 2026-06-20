import type { IBillingRepository } from "../../application/billing-repository";
import { nextPeriod, nextRetryAt, MAX_DUNNING_ATTEMPTS } from "../../domain/billing-cycle";

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
    await deps.repo.updateChargeAttempt(attempt.id, { status: "succeeded" });

    const cycle = await deps.repo.findCycleById(attempt.cycle_id);
    let artisanId: number | null = null;

    if (cycle) {
      await deps.repo.updateCycleStatus(cycle.id, { status: "paid", paidAt: now });

      const sub = await deps.repo.findSubscriptionById(cycle.subscription_id);
      if (sub) {
        artisanId = sub.artisan_id;
        const interval = sub.billing_interval === "yearly" ? "yearly" : "monthly";
        const { start, end } = nextPeriod(cycle.period_end, interval);
        await deps.repo.updateSubscriptionPeriod(sub.id, "active", cycle.period_end, end);
        const existing = await deps.repo.findPendingCycleForPeriod(sub.id, start);
        if (!existing) {
          await deps.repo.createCycle({ subscriptionId: sub.id, periodStart: start, periodEnd: end, amountCents: cycle.amount_cents, currency: cycle.currency });
        }
        await deps.repo.appendEvent({
          entityType: "billing_subscription",
          entityId: sub.id,
          eventType: "subscription.period_advanced",
          payload: { via: "webhook", artisanId, nextPeriodStart: start.toISOString(), nextPeriodEnd: end.toISOString() },
          actor: "stripe_webhook",
        });
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
    /* Idempotence scheduler↔webhook : ne pas écraser un cycle déjà payé */
    if (cycle?.status === "paid") return;

    await deps.repo.updateChargeAttempt(attempt.id, {
      status: "failed",
      failureCode: failureCode ?? null,
      failureMessage: failureMessage ?? null,
    });
    const attemptCount = cycle?.attempt_count ?? attempt.attempt_no;
    const isFinalAttempt = attemptCount >= MAX_DUNNING_ATTEMPTS;
    const retryAt = isFinalAttempt ? null : nextRetryAt(now, attemptCount);
    await deps.repo.updateCycleStatus(attempt.cycle_id, { status: "failed", failedAt: now, nextRetryAt: retryAt });
    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: attempt.cycle_id,
      eventType: "cycle.charge_failed",
      payload: { paymentIntentId, via: "webhook", failureCode, failureMessage, nextRetryAt: retryAt?.toISOString() ?? null },
      actor: "stripe_webhook",
    });
    if (isFinalAttempt && cycle) {
      const sub = await deps.repo.findSubscriptionById(cycle.subscription_id);
      if (sub) {
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
}

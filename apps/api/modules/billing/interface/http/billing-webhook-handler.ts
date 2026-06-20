import type { IBillingRepository } from "../../application/billing-repository";
import { nextPeriod, nextRetryAt } from "../../domain/billing-cycle";

export interface BillingWebhookDeps {
  readonly repo: IBillingRepository;
}

export async function handleBillingWebhookEvent(
  deps: BillingWebhookDeps,
  eventType: string,
  paymentIntentId: string,
  failureCode?: string | null,
  failureMessage?: string | null,
): Promise<void> {
  const attempt = await deps.repo.findChargeAttemptByPaymentIntentId(paymentIntentId);
  if (!attempt) return;

  const now = new Date();

  if (eventType === "payment_intent.succeeded") {
    await deps.repo.updateChargeAttempt(attempt.id, { status: "succeeded" });

    const cycle = await deps.repo.findCycleById(attempt.cycle_id);
    if (cycle) {
      await deps.repo.updateCycleStatus(cycle.id, { status: "paid", paidAt: now });

      const sub = await deps.repo.findSubscriptionById(cycle.subscription_id);
      if (sub) {
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
          payload: { via: "webhook", nextPeriodStart: start.toISOString(), nextPeriodEnd: end.toISOString() },
          actor: "stripe_webhook",
        });
      }
    }

    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: attempt.cycle_id,
      eventType: "cycle.paid",
      payload: { paymentIntentId, via: "webhook" },
      actor: "stripe_webhook",
    });
  } else if (eventType === "payment_intent.payment_failed") {
    await deps.repo.updateChargeAttempt(attempt.id, {
      status: "failed",
      failureCode: failureCode ?? null,
      failureMessage: failureMessage ?? null,
    });
    const cycle = await deps.repo.findCycleById(attempt.cycle_id);
    const attemptCount = cycle?.attempt_count ?? attempt.attempt_no;
    const retryAt = nextRetryAt(now, attemptCount);
    await deps.repo.updateCycleStatus(attempt.cycle_id, { status: "failed", failedAt: now, nextRetryAt: retryAt });
    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: attempt.cycle_id,
      eventType: "cycle.charge_failed",
      payload: { paymentIntentId, via: "webhook", failureCode, failureMessage, nextRetryAt: retryAt?.toISOString() ?? null },
      actor: "stripe_webhook",
    });
  }
}

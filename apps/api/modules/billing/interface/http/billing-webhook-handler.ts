import type { IBillingRepository } from "../../application/billing-repository";
import { nextRetryAt } from "../../domain/billing-cycle";

export interface BillingWebhookDeps {
  readonly repo: IBillingRepository;
}

/**
 * Traite les événements Stripe relatifs aux PaymentIntents du billing maison.
 * Appelé depuis le webhook Stripe global après vérification de signature.
 */
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
    await deps.repo.updateCycleStatus(attempt.cycle_id, { status: "paid", paidAt: now });
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
    const cycle = await deps.repo.findPendingCycle(attempt.cycle_id);
    const attemptCount = cycle?.attempt_count ?? attempt.attempt_no;
    const retryAt = nextRetryAt(now, attemptCount);
    await deps.repo.updateCycleStatus(attempt.cycle_id, {
      status: "failed",
      failedAt: now,
      nextRetryAt: retryAt,
    });
    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: attempt.cycle_id,
      eventType: "cycle.charge_failed",
      payload: { paymentIntentId, via: "webhook", failureCode, failureMessage, nextRetryAt: retryAt?.toISOString() ?? null },
      actor: "stripe_webhook",
    });
  }
}

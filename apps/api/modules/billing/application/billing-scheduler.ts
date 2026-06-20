import type { IBillingRepository } from "./billing-repository";
import type { BillingPort } from "../../../shared/ports/billing";
import { isDue, isZombie, nextRetryAt } from "../domain/billing-cycle";

export interface SchedulerDeps {
  readonly repo: IBillingRepository;
  readonly billing: BillingPort;
}

const MAX_DUNNING_ATTEMPTS = 4;

export class MaxAttemptsReachedError extends Error {
  constructor(cycleId: number) {
    super(`Cycle ${cycleId} : tentatives max atteintes (${MAX_DUNNING_ATTEMPTS})`);
    this.name = "MaxAttemptsReachedError";
  }
}

/**
 * Prélève off-session pour un cycle donné.
 * Protocole anti double-prélèvement : crée l'attempt (clé d'idempotence) AVANT l'appel Stripe.
 */
export async function chargeOffSessionForCycle(
  deps: SchedulerDeps,
  cycleId: number,
  subscriptionId: number,
  artisanId: number,
): Promise<void> {
  const now = new Date();

  const allCycles = await deps.repo.findPendingCycle(subscriptionId);
  const cycle = allCycles?.id === cycleId ? allCycles : null;
  if (!cycle) return;
  if (!isDue(cycle, now)) return;

  const newAttemptCount = cycle.attempt_count + 1;
  if (newAttemptCount > MAX_DUNNING_ATTEMPTS) throw new MaxAttemptsReachedError(cycleId);

  const idempotencyKey = `billing-cycle-${cycleId}-attempt-${newAttemptCount}`;

  await deps.repo.updateCycleStatus(cycleId, {
    status: "charging",
    chargingStartedAt: now,
    attemptCount: newAttemptCount,
  });

  const attempt = await deps.repo.createChargeAttempt({
    cycleId,
    attemptNo: newAttemptCount,
    idempotencyKey,
  });

  const ctx = { artisanId, userId: 0 } as const;
  const pm = await deps.repo.findDefaultPaymentMethod(ctx);
  const customerId = pm?.stripe_customer_id;
  if (!pm || !customerId) {
    await deps.repo.updateCycleStatus(cycleId, {
      status: "failed",
      failedAt: now,
      nextRetryAt: nextRetryAt(now, newAttemptCount),
    });
    await deps.repo.updateChargeAttempt(attempt.id, { status: "failed", failureCode: "no_payment_method" });
    return;
  }

  try {
    const result = await deps.billing.chargeOffSession({
      customerId,
      paymentMethodId: pm.stripe_payment_method_id!,
      amountCents: cycle.amount_cents,
      currency: "eur",
      description: `Abonnement Operioz — période ${cycle.period_start.toISOString().slice(0, 10)}`,
      metadata: { artisan_id: String(artisanId), cycle_id: String(cycleId) },
      idempotencyKey,
    });

    await deps.repo.updateChargeAttempt(attempt.id, {
      stripePaymentIntentId: result.paymentIntentId,
      status: result.status,
    });

    if (result.status === "succeeded") {
      await deps.repo.updateCycleStatus(cycleId, { status: "paid", paidAt: new Date() });
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycleId,
        eventType: "cycle.paid",
        payload: { paymentIntentId: result.paymentIntentId, artisanId },
        actor: "scheduler",
      });
    } else if (result.status === "requires_action") {
      /*
       * Off-session 3DS : l'artisan doit mettre à jour son moyen de paiement (on ne peut pas
       * compléter l'auth en son absence). On traite comme un échec pour déclencher le dunning.
       */
      const retryAt3ds = nextRetryAt(now, newAttemptCount);
      const isFinal3ds = newAttemptCount >= MAX_DUNNING_ATTEMPTS;
      await deps.repo.updateCycleStatus(cycleId, {
        status: "failed",
        failedAt: now,
        nextRetryAt: isFinal3ds ? null : retryAt3ds,
      });
      await deps.repo.updateChargeAttempt(attempt.id, { status: "failed", failureCode: "requires_action" });
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycleId,
        eventType: "cycle.requires_action",
        payload: { paymentIntentId: result.paymentIntentId, artisanId, treatedAsFailed: true },
        actor: "scheduler",
      });
    } else {
      await deps.repo.updateCycleStatus(cycleId, { status: "processing" });
    }
  } catch (err) {
    const failureMessage = err instanceof Error ? err.message : String(err);
    const retryAt = nextRetryAt(now, newAttemptCount);
    const isFinalAttempt = newAttemptCount >= MAX_DUNNING_ATTEMPTS;
    await deps.repo.updateCycleStatus(cycleId, {
      status: "failed",
      failedAt: now,
      nextRetryAt: isFinalAttempt ? null : retryAt,
    });
    await deps.repo.updateChargeAttempt(attempt.id, {
      status: "failed",
      failureMessage,
    });
    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: cycleId,
      eventType: "cycle.charge_failed",
      payload: { artisanId, attemptNo: newAttemptCount, failureMessage, nextRetryAt: retryAt?.toISOString() ?? null },
      actor: "scheduler",
    });
  }
}

/**
 * Réconcilie les cycles zombies (bloqués en `charging` > 15 min) via l'état réel du PaymentIntent.
 */
export async function recoverZombies(deps: SchedulerDeps): Promise<void> {
  const now = new Date();
  const zombies = await deps.repo.findZombieCycles(now);

  for (const cycle of zombies) {
    if (!isZombie(cycle, now)) continue;

    const lastAttempt = await deps.repo.findLastAttemptByCycleId(cycle.id);
    const piId = lastAttempt?.stripe_payment_intent_id ?? null;

    if (!piId) {
      await deps.repo.updateCycleStatus(cycle.id, {
        status: "failed",
        failedAt: now,
        nextRetryAt: nextRetryAt(now, cycle.attempt_count),
      });
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycle.id,
        eventType: "cycle.zombie_recovered",
        payload: { reason: "no_payment_intent_id" },
        actor: "scheduler",
      });
      continue;
    }

    const pi = await deps.billing.retrievePaymentIntent(piId);

    if (pi.status === "succeeded") {
      await deps.repo.updateCycleStatus(cycle.id, { status: "paid", paidAt: now });
    } else if (pi.status === "requires_action") {
      await deps.repo.updateCycleStatus(cycle.id, { status: "requires_action" });
    } else if (pi.status === "processing") {
      await deps.repo.updateCycleStatus(cycle.id, { status: "processing" });
    } else {
      await deps.repo.updateCycleStatus(cycle.id, {
        status: "failed",
        failedAt: now,
        nextRetryAt: nextRetryAt(now, cycle.attempt_count),
      });
    }

    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: cycle.id,
      eventType: "cycle.zombie_recovered",
      payload: { piStatus: pi.status, paymentIntentId: piId },
      actor: "scheduler",
    });
  }
}

/**
 * Tick principal du scheduler : récupère les zombies puis prélève tous les cycles échus.
 */
export async function runSchedulerTick(deps: SchedulerDeps): Promise<{ charged: number; zombiesRecovered: number }> {
  await recoverZombies(deps);

  const now = new Date();
  const due = await deps.repo.findSubscriptionsWithDueCycles(now);

  let charged = 0;
  for (const { subscription, cycle } of due) {
    try {
      await chargeOffSessionForCycle(deps, cycle.id, subscription.id, subscription.artisan_id);
      charged++;
    } catch (err) {
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycle.id,
        eventType: "cycle.tick_error",
        payload: { error: err instanceof Error ? err.message : String(err) },
        actor: "scheduler",
      });
    }
  }

  const zombies = await deps.repo.findZombieCycles(now);
  return { charged, zombiesRecovered: zombies.length };
}

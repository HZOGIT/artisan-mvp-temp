import type { IBillingRepository } from "./billing-repository";
import type { BillingPort } from "../../../shared/ports/billing";
import type { SubscriptionEventNotifier } from "../../subscription/application/subscription-event-notifier";
import { isDue, isZombie, nextPeriod, nextRetryAt } from "../domain/billing-cycle";
import { subscriptionEmail } from "../../subscription/domain/webhook";

export interface SchedulerDeps {
  readonly repo: IBillingRepository;
  readonly billing: BillingPort;
  readonly notifier?: SubscriptionEventNotifier;
  readonly appUrl?: string;
}

const MAX_DUNNING_ATTEMPTS = 4;

function resolveInterval(raw: string | null | undefined): "monthly" | "yearly" {
  return raw === "yearly" ? "yearly" : "monthly";
}

/**
 * Après un cycle paid : met la subscription à `active` + crée le cycle de la période suivante.
 * Idempotent : si un cycle pending existe déjà pour cette subscription, ne crée pas de doublon.
 */
async function advanceSubscriptionAfterPayment(
  repo: IBillingRepository,
  subscriptionId: number,
  artisanId: number,
  paidCycle: { period_end: Date; amount_cents: number; currency: string },
  interval: "monthly" | "yearly" = "monthly",
): Promise<void> {
  const { start, end } = nextPeriod(paidCycle.period_end, interval);
  await repo.updateSubscriptionPeriod(subscriptionId, "active", paidCycle.period_end, end);
  const existing = await repo.findPendingCycle(subscriptionId);
  if (!existing) {
    await repo.createCycle({ subscriptionId, periodStart: start, periodEnd: end, amountCents: paidCycle.amount_cents, currency: paidCycle.currency });
  }
  await repo.appendEvent({
    entityType: "billing_subscription",
    entityId: subscriptionId,
    eventType: "subscription.period_advanced",
    payload: { artisanId, nextPeriodStart: start.toISOString(), nextPeriodEnd: end.toISOString() },
    actor: "scheduler",
  });
}

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

  const cycle = await deps.repo.findCycleById(cycleId);
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
      const paidAt = new Date();
      await deps.repo.updateCycleStatus(cycleId, { status: "paid", paidAt });
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycleId,
        eventType: "cycle.paid",
        payload: { paymentIntentId: result.paymentIntentId, artisanId },
        actor: "scheduler",
      });
      const sub = await deps.repo.findSubscriptionById(subscriptionId);
      const interval = resolveInterval(sub?.billing_interval);
      await advanceSubscriptionAfterPayment(deps.repo, subscriptionId, artisanId, cycle, interval);
    } else if (result.status === "requires_action") {
      /* Off-session 3DS impossible sans présence de l'utilisateur — traité comme un échec de paiement. */
      await deps.repo.updateChargeAttempt(attempt.id, { status: "failed", failureCode: "requires_action" });
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycleId,
        eventType: "cycle.requires_action",
        payload: { paymentIntentId: result.paymentIntentId, artisanId, treatedAsFailed: true },
        actor: "scheduler",
      });
      await handleDunning(deps, { cycleId, subscriptionId, artisanId, now, newAttemptCount, attempt, failureMessage: "requires_action" });
    } else {
      await deps.repo.updateCycleStatus(cycleId, { status: "processing" });
    }
  } catch (err) {
    const failureMessage = err instanceof Error ? err.message : String(err);
    await handleDunning(deps, { cycleId, subscriptionId, artisanId, now, newAttemptCount, attempt, failureMessage });
  }
}

interface DunningParams {
  cycleId: number;
  subscriptionId: number;
  artisanId: number;
  now: Date;
  newAttemptCount: number;
  attempt: { id: number };
  failureMessage: string | null;
}

async function handleDunning(deps: SchedulerDeps, p: DunningParams): Promise<void> {
  const { cycleId, subscriptionId, artisanId, now, newAttemptCount, attempt, failureMessage } = p;
  const retryAt = nextRetryAt(now, newAttemptCount);
  const isFinalAttempt = newAttemptCount >= MAX_DUNNING_ATTEMPTS;

  await deps.repo.updateCycleStatus(cycleId, {
    status: "failed",
    failedAt: now,
    nextRetryAt: isFinalAttempt ? null : retryAt,
    attemptCount: newAttemptCount,
  });
  await deps.repo.updateChargeAttempt(attempt.id, { status: "failed", failureMessage });
  await deps.repo.appendEvent({
    entityType: "billing_cycle",
    entityId: cycleId,
    eventType: "cycle.charge_failed",
    payload: { artisanId, attemptNo: newAttemptCount, failureMessage, nextRetryAt: retryAt?.toISOString() ?? null },
    actor: "scheduler",
  });

  if (isFinalAttempt) {
    await deps.repo.updateSubscriptionStatus({ artisanId, userId: 0 }, "past_due");
    await deps.repo.appendEvent({
      entityType: "billing_subscription",
      entityId: subscriptionId,
      eventType: "subscription.suspended",
      payload: { artisanId, reason: "max_dunning_attempts" },
      actor: "scheduler",
    });
    if (deps.notifier) {
      const appUrl = deps.appUrl ?? "https://www.operioz.com";
      try {
        await deps.notifier.notifyArtisan(artisanId, {
          type: "erreur",
          titre: "Paiement impossible — abonnement suspendu",
          message: "Votre abonnement est suspendu suite à plusieurs échecs de prélèvement. Mettez à jour votre moyen de paiement.",
          lien: "/parametres?tab=abonnement",
        });
        await deps.notifier.emailArtisanOwner(
          artisanId,
          "Abonnement Operioz suspendu — action requise",
          subscriptionEmail({
            title: "Abonnement suspendu",
            body: "Plusieurs tentatives de prélèvement ont échoué. Votre accès à Operioz est suspendu. Mettez à jour votre moyen de paiement pour le rétablir immédiatement.",
            ctaLabel: "Mettre à jour mon paiement",
            ctaUrl: `${appUrl}/parametres?tab=abonnement`,
          }),
        );
      } catch { /* best-effort */ }
    }
  } else if (deps.notifier) {
    const appUrl = deps.appUrl ?? "https://www.operioz.com";
    try {
      await deps.notifier.notifyArtisan(artisanId, {
        type: "erreur",
        titre: "Échec de prélèvement",
        message: `Votre paiement a échoué (tentative ${newAttemptCount}/${MAX_DUNNING_ATTEMPTS}). Nous réessaierons automatiquement.`,
        lien: "/parametres?tab=abonnement",
      });
      await deps.notifier.emailArtisanOwner(
        artisanId,
        "Problème de paiement — Operioz",
        subscriptionEmail({
          title: "Echec de prélèvement",
          body: `Le prélèvement de votre abonnement Operioz a échoué (tentative ${newAttemptCount}/${MAX_DUNNING_ATTEMPTS}). Nous réessaierons automatiquement. Pour éviter toute suspension, vérifiez votre moyen de paiement.`,
          ctaLabel: "Vérifier mon paiement",
          ctaUrl: `${appUrl}/parametres?tab=abonnement`,
        }),
      );
    } catch { /* best-effort */ }
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
      const sub = await deps.repo.findSubscriptionById(cycle.subscription_id);
      if (sub) await advanceSubscriptionAfterPayment(deps.repo, cycle.subscription_id, sub.artisan_id, cycle, resolveInterval(sub.billing_interval));
    } else if (pi.status === "requires_action" || pi.status === "canceled") {
      await deps.repo.updateCycleStatus(cycle.id, {
        status: "failed",
        failedAt: now,
        nextRetryAt: nextRetryAt(now, cycle.attempt_count),
      });
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

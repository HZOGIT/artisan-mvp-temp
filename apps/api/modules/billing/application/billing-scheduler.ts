import type { IBillingRepository } from "./billing-repository";
import type { BillingPort } from "../../../shared/ports/billing";
import type { SubscriptionEventNotifier } from "../../subscription/application/subscription-event-notifier";
import { isDue, isZombie, isStuckProcessing, nextPeriod, nextRetryAt, MAX_DUNNING_ATTEMPTS } from "../domain/billing-cycle";
import { planById } from "../domain/plan";
import { subscriptionEmail } from "../../subscription/domain/webhook";

export interface SchedulerDeps {
  readonly repo: IBillingRepository;
  readonly billing: BillingPort;
  readonly notifier?: SubscriptionEventNotifier;
  readonly appUrl?: string;
}

const TICK_BATCH_SIZE = 200;
const NO_PM_RETRY_DELAY_MS = 24 * 3600_000;

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

  /*
   * Cycle créé AVANT updateSubscriptionPeriod — même pattern que activateExpiredTrials.
   * Si createCycle réussit mais updateSubscriptionPeriod échoue (erreur DB transitoire,
   * crash), le scheduler retrouve le cycle pending au tick suivant (period_start <= now)
   * et le charge → advanceSubscriptionAfterPayment relancée → auto-healing.
   * À l'inverse (updateSubscriptionPeriod en premier), un échec de createCycle laisse
   * la sub en période suivante sans cycle → periode de facturation perdue, jamais rattrapée.
   */
  const existing = await repo.findPendingCycleForPeriod(subscriptionId, start);
  if (!existing) {
    /*
     * Utilise le tarif du plan courant (pas le montant du cycle expiré).
     * Si l'artisan a changé de plan pendant le dunning, le prochain cycle reflète
     * le nouveau tarif — paidCycle.amount_cents est celui de la période précédente.
     */
    const sub = await repo.findSubscriptionById(subscriptionId);
    const plan = sub ? planById(sub.plan_id) : undefined;
    const amountCents = plan ? plan.amountCentsByInterval[interval] : paidCycle.amount_cents;
    await repo.createCycle({ subscriptionId, periodStart: start, periodEnd: end, amountCents, currency: paidCycle.currency });
  }

  await repo.updateSubscriptionPeriod(subscriptionId, "active", paidCycle.period_end, end);
  await repo.appendEvent({
    entityType: "billing_subscription",
    entityId: subscriptionId,
    eventType: "subscription.period_advanced",
    payload: { via: "scheduler", artisanId, nextPeriodStart: start.toISOString(), nextPeriodEnd: end.toISOString() },
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
  /*
   * MaxAttemptsReachedError n'est levée QUE pour les cycles `failed` (dunning normal).
   * Un cycle `pending` avec attempt_count élevé est un cycle repris après dunning épuisé
   * (resumeBillingIfAbandoned) : on laisse passer pour éviter de bloquer indéfiniment.
   */
  if (newAttemptCount > MAX_DUNNING_ATTEMPTS && cycle.status !== "pending") {
    throw new MaxAttemptsReachedError(cycleId);
  }

  const idempotencyKey = `billing-cycle-${cycleId}-attempt-${newAttemptCount}`;

  /* Vérif PM avant de consommer une tentative de dunning */
  const ctx = { artisanId, userId: 0 } as const;
  const pm = await deps.repo.findDefaultPaymentMethod(ctx);
  const customerId = pm?.stripe_customer_id;
  const stripePaymentMethodId = pm?.stripe_payment_method_id;
  if (!pm || !customerId || !stripePaymentMethodId) {
    const pmRetryAt = new Date(now.getTime() + NO_PM_RETRY_DELAY_MS);
    await deps.repo.updateCycleStatus(cycleId, { status: "failed", failedAt: now, nextRetryAt: pmRetryAt });
    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: cycleId,
      eventType: "cycle.no_payment_method",
      payload: { artisanId },
      actor: "scheduler",
    });
    return;
  }

  const claimed = await deps.repo.claimCycleForCharging(cycleId, now, newAttemptCount);
  if (!claimed) return;

  const attempt = await deps.repo.createChargeAttempt({
    cycleId,
    attemptNo: newAttemptCount,
    idempotencyKey,
  });

  /*
   * Flag positionné dès que Stripe confirme "succeeded" — avant toute mise à jour DB.
   * Si une erreur DB survient en post-traitement (updateCycleStatus, advanceSubscriptionAfterPayment…),
   * le catch NE doit PAS appeler handleDunning : le prélèvement a déjà eu lieu, et dunning
   * fixerait next_retry_at → le scheduler rechargerait à J+1 avec une clé d'idempotence
   * différente → double-prélèvement. L'auto-healing via le cycle pending de la période suivante
   * (créé avant updateSubscriptionPeriod, cf. FIX-CDF) corrige l'état de la sub.
   */
  let chargeSucceeded = false;
  try {
    const result = await deps.billing.chargeOffSession({
      customerId,
      paymentMethodId: stripePaymentMethodId,
      amountCents: cycle.amount_cents,
      currency: "eur",
      description: `Abonnement Operioz — période ${cycle.period_start.toISOString().slice(0, 10)}`,
      metadata: { artisan_id: String(artisanId), cycle_id: String(cycleId) },
      idempotencyKey,
    });

    if (result.status === "succeeded") chargeSucceeded = true;

    await deps.repo.updateChargeAttempt(attempt.id, {
      stripePaymentIntentId: result.paymentIntentId,
      status: result.status,
    });

    if (result.status === "succeeded") {
      const paidAt = new Date();
      await deps.repo.updateCycleStatus(cycleId, { status: "paid", paidAt, failedAt: null, nextRetryAt: null });
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycleId,
        eventType: "cycle.paid",
        payload: { via: "scheduler", paymentIntentId: result.paymentIntentId, artisanId, paidAt: paidAt.toISOString() },
        actor: "scheduler",
      });
      const sub = await deps.repo.findSubscriptionById(subscriptionId);
      const interval = resolveInterval(sub?.billing_interval);
      const plan = sub ? planById(sub.plan_id) : undefined;
      await deps.repo.createInvoiceForCycle({
        artisanId,
        cycleId,
        amountCents: cycle.amount_cents,
        taxCents: Math.round(cycle.amount_cents / 6),
        currency: cycle.currency,
        planDescription: `Abonnement ${plan?.name ?? (sub?.plan_id ?? "Operioz")}`,
      });
      /*
       * Guard symétrique de FIX-CE (webhook) et FIX-CC (zombie recovery) :
       * ne pas avancer la période si la sub a été annulée entre le claimCycleForCharging
       * et le retour Stripe (ex. multi-réplica : processDueCancellations d'un autre tick
       * annule la sub pendant que le PI est en vol).
       * Le cycle est déjà marqué "paid" (audit trail préservé) ; on ne crée pas le prochain
       * cycle et on ne remet pas le status à "active" → sub reste canceled.
       */
      if (sub?.status !== "canceled") {
        await advanceSubscriptionAfterPayment(deps.repo, subscriptionId, artisanId, cycle, interval);
      }
    } else if (result.status === "requires_action") {
      /* Off-session 3DS impossible sans présence de l'utilisateur — traité comme un échec de paiement. */
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycleId,
        eventType: "cycle.requires_action",
        payload: { paymentIntentId: result.paymentIntentId, artisanId, treatedAsFailed: true },
        actor: "scheduler",
      });
      await handleDunning(deps, { cycleId, subscriptionId, artisanId, now, newAttemptCount, attempt, failureCode: "requires_action", failureMessage: null });
    } else {
      await deps.repo.updateCycleStatus(cycleId, { status: "processing", failedAt: null, nextRetryAt: null });
    }
  } catch (err) {
    if (chargeSucceeded) return;
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
  failureCode?: string | null;
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
  await deps.repo.updateChargeAttempt(attempt.id, { status: "failed", failureCode: p.failureCode ?? undefined, failureMessage });
  await deps.repo.appendEvent({
    entityType: "billing_cycle",
    entityId: cycleId,
    eventType: "cycle.charge_failed",
    payload: { via: "scheduler", artisanId, attemptNo: newAttemptCount, failureCode: p.failureCode ?? null, failureMessage, nextRetryAt: (isFinalAttempt ? null : retryAt)?.toISOString() ?? null },
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
      /*
       * Notif in-app et email dans des try/catch séparés (FIX-CDM) : si notifyArtisan
       * échoue (service in-app indisponible), l'email de suspension est quand même envoyé.
       * Un seul catch commun masquait l'échec de l'une et silençait l'autre.
       */
      try {
        await deps.notifier.notifyArtisan(artisanId, {
          type: "erreur",
          titre: "Paiement impossible — abonnement suspendu",
          message: "Votre abonnement est suspendu suite à plusieurs échecs de prélèvement. Mettez à jour votre moyen de paiement.",
          lien: "/parametres?tab=abonnement",
        });
      } catch { /* best-effort */ }
      try {
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
    /* FIX-CDM : deux try/catch indépendants pour garantir l'envoi de l'email même si la notif in-app échoue */
    try {
      await deps.notifier.notifyArtisan(artisanId, {
        type: "erreur",
        titre: "Échec de prélèvement",
        message: `Votre paiement a échoué (tentative ${newAttemptCount}/${MAX_DUNNING_ATTEMPTS}). Nous réessaierons automatiquement.`,
        lien: "/parametres?tab=abonnement",
      });
    } catch { /* best-effort */ }
    try {
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
export async function recoverZombies(deps: SchedulerDeps): Promise<number> {
  const now = new Date();
  const zombies = await deps.repo.findZombieCycles(now);
  let recovered = 0;

  for (const cycle of zombies) {
    if (!isZombie(cycle, now) && !isStuckProcessing(cycle, now)) continue;
    recovered++;

    /*
     * Déclaré avant le try pour rendre artisanId disponible dans le catch.
     * Sub fetché en premier dans le try : une seule requête au lieu de deux
     * (l'ancienne version fetché sub deux fois : dans le branch no-PI et dans le branch PI).
     */
    let cycleArtisanId: number | null = null;
    try {
    const sub = await deps.repo.findSubscriptionById(cycle.subscription_id);
    cycleArtisanId = sub?.artisan_id ?? null;

    const lastAttempt = await deps.repo.findLastAttemptByCycleId(cycle.id);
    const piId = lastAttempt?.stripe_payment_intent_id ?? null;

    if (!piId || !lastAttempt) {
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycle.id,
        eventType: "cycle.zombie_recovered",
        payload: { reason: "no_payment_intent_id", artisanId: cycleArtisanId },
        actor: "scheduler",
      });
      if (lastAttempt) {
        if (!sub) {
          await deps.repo.updateCycleStatus(cycle.id, { status: "failed", failedAt: now });
          await deps.repo.updateChargeAttempt(lastAttempt.id, { status: "failed", failureMessage: "zombie_orphan_no_pi" });
        } else if (sub.status === "canceled") {
          /* Sub annulée pendant que le cycle était en vol (no-PI) — ne pas dunner. */
          await deps.repo.updateCycleStatus(cycle.id, { status: "failed", failedAt: now });
          await deps.repo.updateChargeAttempt(lastAttempt.id, { status: "failed", failureMessage: "zombie_canceled_sub_no_pi" });
          await deps.repo.appendEvent({
            entityType: "billing_cycle",
            entityId: cycle.id,
            eventType: "cycle.zombie_canceled_sub",
            payload: { artisanId: sub.artisan_id, piStatus: "none", paymentIntentId: null, cycleMarkedAs: "failed" },
            actor: "scheduler",
          });
        } else {
          await handleDunning(deps, {
            cycleId: cycle.id,
            subscriptionId: cycle.subscription_id,
            artisanId: sub.artisan_id,
            now,
            newAttemptCount: cycle.attempt_count,
            attempt: lastAttempt,
            failureMessage: "zombie_no_pi",
          });
        }
      } else {
        await deps.repo.updateCycleStatus(cycle.id, {
          status: "failed",
          failedAt: now,
          nextRetryAt: nextRetryAt(now, cycle.attempt_count),
        });
      }
      continue;
    }

    const pi = await deps.billing.retrievePaymentIntent(piId);

    await deps.repo.appendEvent({
      entityType: "billing_cycle",
      entityId: cycle.id,
      eventType: "cycle.zombie_recovered",
      payload: { piStatus: pi.status, paymentIntentId: piId, artisanId: cycleArtisanId },
      actor: "scheduler",
    });

    if (!sub) {
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycle.id,
        eventType: "cycle.zombie_orphan",
        payload: { subscriptionId: cycle.subscription_id, piId },
        actor: "scheduler",
      });
      continue;
    }
    const artisanId = sub.artisan_id;

    /*
     * Guard : sub annulée pendant que le PI était en vol (ex. virement SEPA 1-3 jours).
     * Ne jamais dunner ni avancer la période — cela ressusciterait une sub annulée.
     * On marque le cycle paid/failed selon le PI et on laisse la sub canceled.
     */
    if (sub.status === "canceled") {
      const finalStatus = pi.status === "succeeded" ? "paid" : "failed";
      await deps.repo.updateCycleStatus(cycle.id, {
        status: finalStatus,
        ...(finalStatus === "paid" ? { paidAt: now, failedAt: null, nextRetryAt: null } : { failedAt: now }),
      });
      if (lastAttempt) await deps.repo.updateChargeAttempt(lastAttempt.id, { status: pi.status === "succeeded" ? "succeeded" : "failed" });
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycle.id,
        eventType: "cycle.zombie_canceled_sub",
        payload: { artisanId, piStatus: pi.status, paymentIntentId: piId, cycleMarkedAs: finalStatus },
        actor: "scheduler",
      });
      continue;
    }

    if (pi.status === "succeeded") {
      const paidAt = now;
      await deps.repo.updateCycleStatus(cycle.id, { status: "paid", paidAt, failedAt: null, nextRetryAt: null });
      if (lastAttempt) await deps.repo.updateChargeAttempt(lastAttempt.id, { status: "succeeded" });
      await deps.repo.appendEvent({
        entityType: "billing_cycle",
        entityId: cycle.id,
        eventType: "cycle.paid",
        payload: { via: "zombie_recovery", paymentIntentId: piId, artisanId, paidAt: paidAt.toISOString() },
        actor: "scheduler",
      });
      const zombiePlan = planById(sub.plan_id);
      await deps.repo.createInvoiceForCycle({
        artisanId,
        cycleId: cycle.id,
        amountCents: cycle.amount_cents,
        taxCents: Math.round(cycle.amount_cents / 6),
        currency: cycle.currency,
        planDescription: `Abonnement ${zombiePlan?.name ?? sub.plan_id}`,
      });
      await advanceSubscriptionAfterPayment(deps.repo, cycle.subscription_id, artisanId, cycle, resolveInterval(sub.billing_interval));
    } else if (pi.status === "processing") {
      /*
       * Le PI est toujours en cours (SEPA/virement, jusqu'à 14 jours ouvrés).
       * On remet chargingStartedAt à maintenant pour décaler la prochaine vérification
       * zombie de 72h — sans ce reset, findZombieCycles retrouve le cycle à chaque tick
       * (toutes les 10 min) et provoque un appel Stripe inutile toutes les 10 min.
       * On nettoie aussi les stale fields d'un éventuel dunning précédent.
       */
      await deps.repo.updateCycleStatus(cycle.id, { status: "processing", chargingStartedAt: now, failedAt: null, nextRetryAt: null });
      if (lastAttempt) await deps.repo.updateChargeAttempt(lastAttempt.id, { status: "processing" });
    } else {
      /* requires_action, canceled, failed, état inconnu → dunning complet (notif + suspension) */
      await handleDunning(deps, {
        cycleId: cycle.id,
        subscriptionId: cycle.subscription_id,
        artisanId,
        now,
        newAttemptCount: cycle.attempt_count,
        attempt: lastAttempt,
        failureMessage: pi.failureMessage ?? pi.status,
      });
    }
    } catch (err) {
      /*
       * appendEvent peut échouer si la DB est down (même contexte que l'erreur dans le try).
       * Sans protection, un throw ici avorterait la boucle pour tous les zombies restants.
       * Separately : réinitialise chargingStartedAt pour éviter la relance immédiate à chaque
       * tick (ex. retrievePaymentIntent 404 persistant → boucle d'erreur toutes les 10 min).
       * Les deux sont best-effort car la DB peut encore être indisponible.
       */
      try {
        await deps.repo.appendEvent({
          entityType: "billing_cycle",
          entityId: cycle.id,
          eventType: "cycle.zombie_recovery_error",
          payload: { cycleId: cycle.id, artisanId: cycleArtisanId, error: err instanceof Error ? err.message : String(err) },
          actor: "scheduler",
        });
      } catch { /* best-effort — ne pas avorter la boucle sur échec de logging */ }
      /* Cooling period : repousse la prochaine détection zombie de ZOMBIE_THRESHOLD */
      try {
        await deps.repo.updateCycleStatus(cycle.id, { status: cycle.status, chargingStartedAt: now });
      } catch { /* best-effort */ }
    }
  }
  return recovered;
}

/**
 * Fait passer les abonnements en période d'essai expirée de trialing → active
 * et crée le premier cycle de facturation.
 * Idempotent : ne crée pas de cycle si un pending existe déjà pour cette période.
 */
async function activateExpiredTrials(deps: SchedulerDeps, now: Date): Promise<number> {
  const expired = await deps.repo.findExpiredTrials(now, TICK_BATCH_SIZE);
  let activated = 0;

  for (const sub of expired) {
    try {
      const interval = resolveInterval(sub.billing_interval);
      if (!sub.trial_ends_at) continue;
      const trialEnd = sub.trial_ends_at;
      const { end: periodEnd } = nextPeriod(trialEnd, interval);
      const plan = planById(sub.plan_id);
      if (!plan) {
        await deps.repo.appendEvent({
          entityType: "billing_subscription",
          entityId: sub.id,
          eventType: "subscription.trial_activation_error",
          payload: { artisanId: sub.artisan_id, error: `plan inconnu : ${sub.plan_id}` },
          actor: "scheduler",
        });
        continue;
      }
      const amountCents = plan.amountCentsByInterval[interval];

      /*
       * Cycle créé AVANT updateSubscriptionPeriod(active).
       * Si createCycle échoue, la sub reste trialing → retentée au tick suivant (idempotent).
       * Si updateSubscriptionPeriod échoue APRÈS createCycle, le cycle existe déjà → guard
       * findPendingCycleForPeriod empêche le doublon, et updateSubscriptionPeriod est retentée.
       */
      const existing = await deps.repo.findPendingCycleForPeriod(sub.id, trialEnd);
      if (!existing) {
        await deps.repo.createCycle({
          subscriptionId: sub.id,
          periodStart: trialEnd,
          periodEnd,
          amountCents,
          currency: "eur",
        });
      }

      await deps.repo.updateSubscriptionPeriod(sub.id, "active", trialEnd, periodEnd);

      await deps.repo.appendEvent({
        entityType: "billing_subscription",
        entityId: sub.id,
        eventType: "subscription.trial_expired",
        payload: { artisanId: sub.artisan_id, planId: sub.plan_id, interval },
        actor: "scheduler",
      });

      activated++;
    } catch (err) {
      /* appendEvent peut échouer si la DB est down — protéger pour ne pas avorter la boucle */
      try {
        await deps.repo.appendEvent({
          entityType: "billing_subscription",
          entityId: sub.id,
          eventType: "subscription.trial_activation_error",
          payload: { artisanId: sub.artisan_id, error: err instanceof Error ? err.message : String(err) },
          actor: "scheduler",
        });
      } catch { /* best-effort — ne pas avorter la boucle sur échec de logging */ }
    }
  }

  return activated;
}

/**
 * Annule toutes les subs dont cancel_at est échu, indépendamment de la présence d'un PM.
 * Les subs déjà annulées par la boucle principale (PM présent) sont absentes de findDueCancellations
 * (elles ont déjà status=canceled) — pas de double-traitement.
 */
async function processDueCancellations(deps: SchedulerDeps, now: Date): Promise<number> {
  const subs = await deps.repo.findDueCancellations(now);
  let count = 0;
  for (const sub of subs) {
    try {
      /*
       * findNonTerminalCycle couvre aussi les cycles "failed" avec next_retry_at dans le
       * futur : sans ce fix, le cycle resterait "failed" avec un next_retry_at qui ne
       * sera jamais déclenché (sub annulée → exclue de findSubscriptionsWithDueCycles).
       */
      const nonTerminalCycle = await deps.repo.findNonTerminalCycle(sub.id);
      if (nonTerminalCycle) {
        await deps.repo.updateCycleStatus(nonTerminalCycle.id, { status: "skipped" });
      }
      await deps.repo.updateSubscriptionStatus({ artisanId: sub.artisan_id, userId: 0 }, "canceled");
      await deps.repo.appendEvent({
        entityType: "billing_subscription",
        entityId: sub.id,
        eventType: "subscription.canceled",
        payload: { artisanId: sub.artisan_id, cancelAt: (sub.cancel_at ?? now).toISOString(), via: "scheduler" },
        actor: "scheduler",
      });
      count++;
    } catch (err) {
      /* appendEvent peut échouer si la DB est down — protéger pour ne pas avorter la boucle */
      try {
        await deps.repo.appendEvent({
          entityType: "billing_subscription",
          entityId: sub.id,
          eventType: "subscription.cancel_error",
          payload: { artisanId: sub.artisan_id, error: err instanceof Error ? err.message : String(err) },
          actor: "scheduler",
        });
      } catch { /* best-effort — ne pas avorter la boucle sur échec de logging */ }
    }
  }
  return count;
}

/**
 * Tick principal du scheduler : récupère les zombies, active les trials expirés,
 * puis prélève tous les cycles échus.
 */
export async function runSchedulerTick(deps: SchedulerDeps): Promise<{ charged: number; zombiesRecovered: number; cancelled: number; trialsActivated: number }> {
  const zombiesRecovered = await recoverZombies(deps);
  const trialsActivated = await activateExpiredTrials(deps, new Date());

  const now = new Date();
  const due = await deps.repo.findSubscriptionsWithDueCycles(now, TICK_BATCH_SIZE);

  let charged = 0;
  let cancelled = 0;
  for (const { subscription, cycle } of due) {
    try {
      if (subscription.cancel_at !== null && subscription.cancel_at <= now) {
        await deps.repo.updateCycleStatus(cycle.id, { status: "skipped" });
        await deps.repo.updateSubscriptionStatus({ artisanId: subscription.artisan_id, userId: 0 }, "canceled");
        await deps.repo.appendEvent({
          entityType: "billing_subscription",
          entityId: subscription.id,
          eventType: "subscription.canceled",
          payload: { artisanId: subscription.artisan_id, cancelAt: subscription.cancel_at.toISOString(), via: "scheduler" },
          actor: "scheduler",
        });
        cancelled++;
        continue;
      }
      await chargeOffSessionForCycle(deps, cycle.id, subscription.id, subscription.artisan_id);
      charged++;
    } catch (err) {
      /*
       * appendEvent peut échouer si la DB est down (même contexte que l'erreur dans le try).
       * Sans protection, un throw ici avorterait la boucle pour tous les abonnés restants.
       */
      try {
        await deps.repo.appendEvent({
          entityType: "billing_cycle",
          entityId: cycle.id,
          eventType: "cycle.tick_error",
          payload: { artisanId: subscription.artisan_id, error: err instanceof Error ? err.message : String(err) },
          actor: "scheduler",
        });
      } catch { /* best-effort — ne pas avorter la boucle sur échec de logging */ }
    }
  }

  cancelled += await processDueCancellations(deps, now);

  return { charged, zombiesRecovered, cancelled, trialsActivated };
}

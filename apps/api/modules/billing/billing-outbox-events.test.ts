import { describe, it, expect, beforeEach } from "vitest";
import { FakeBillingRepository } from "./infra/billing-repository-fake";
import { FakeBillingPort } from "../../shared/ports/billing-adapter";
import { handleBillingWebhookEvent } from "./interface/http/billing-webhook-handler";
import {
  activateOnboardingSubscription,
  changePlan,
  cancelAtPeriodEnd,
  reactivateSubscription,
  syncSubscriptionFromStripe,
} from "./application/billing-use-cases";
import {
  runSchedulerTick,
  chargeOffSessionForCycle,
} from "./application/billing-scheduler";
import type { SchedulerDeps } from "./application/billing-scheduler";
import type { TenantContext } from "../../shared/tenant";
import { MAX_DUNNING_ATTEMPTS } from "./domain/billing-cycle";

const A: TenantContext = { artisanId: 1, userId: 10 };

function makeRepo() {
  return new FakeBillingRepository();
}

function makeSchedulerDeps(repo: FakeBillingRepository): SchedulerDeps {
  return { repo, billing: new FakeBillingPort() };
}

async function setupTrialSub(repo: FakeBillingRepository) {
  const pm = await repo.savePaymentMethod({
    artisanId: A.artisanId, stripeCustomerId: "cus_x", stripePaymentMethodId: "pm_x",
    brand: "visa", last4: "4242", expMonth: 12, expYear: 2028, consentedAt: new Date(),
  });
  await repo.setDefaultPaymentMethod(A, pm.id);
  return { pm };
}

describe("abonnement.essai_demarre (OPE-865)", () => {
  it("émet l'event outbox à la fin de l'onboarding", async () => {
    const repo = makeRepo();
    const { pm } = await setupTrialSub(repo);

    await activateOnboardingSubscription({ repo }, A, { planId: "starter", paymentMethodId: pm.id });

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.essai_demarre");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect(ev!.payload).toMatchObject({ planId: "starter" });
    expect(typeof (ev!.payload as Record<string, unknown>)["trialEndsAt"]).toBe("string");
  });

  it("est idempotent : pas de double event si sub existante", async () => {
    const repo = makeRepo();
    const { pm } = await setupTrialSub(repo);

    await activateOnboardingSubscription({ repo }, A, { planId: "starter", paymentMethodId: pm.id });
    await activateOnboardingSubscription({ repo }, A, { planId: "starter", paymentMethodId: pm.id });

    expect(repo.outboxEvents.filter(e => e.action === "abonnement.essai_demarre")).toHaveLength(1);
  });
});

describe("abonnement.active (OPE-865)", () => {
  it("émet l'event outbox quand un trial expire", async () => {
    const repo = makeRepo();
    const { pm } = await setupTrialSub(repo);
    const trialEnd = new Date(Date.now() - 1000);
    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: trialEnd, paymentMethodId: pm.id,
    });

    await runSchedulerTick(makeSchedulerDeps(repo));

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.active");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect(ev!.payload).toMatchObject({ planId: "starter" });
  });
});

describe("abonnement.suspendu (OPE-866)", () => {
  it("émet l'event outbox après dunning épuisé", async () => {
    const repo = makeRepo();
    const billing = new FakeBillingPort();
    billing.nextChargeResult = null;

    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    const pm = await repo.savePaymentMethod({
      artisanId: A.artisanId, stripeCustomerId: "cus_x", stripePaymentMethodId: "pm_x",
      brand: "visa", last4: "4242", expMonth: 12, expYear: 2028, consentedAt: new Date(),
    });
    await repo.setDefaultPaymentMethod(A, pm.id);
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });

    for (let i = 0; i < MAX_DUNNING_ATTEMPTS; i++) {
      const currentCycle = repo.cycles.find(c => c.id === cycle.id)!;
      await repo.updateCycleStatus(cycle.id, {
        status: "failed", failedAt: new Date(0), nextRetryAt: new Date(0), attemptCount: currentCycle.attempt_count,
      });
      await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, A.artisanId);
    }

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.suspendu");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect(ev!.payload).toMatchObject({ raison: "max_dunning_attempts" });
  });
});

describe("abonnement.annule (OPE-866)", () => {
  it("émet l'event outbox via processDueCancellations", async () => {
    const repo = makeRepo();
    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    await repo.updateCancelAt(A, new Date(Date.now() - 1000));

    await runSchedulerTick(makeSchedulerDeps(repo));

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.annule");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect((ev!.payload as Record<string, unknown>)["via"]).toBe("scheduler");
  });
});

describe("abonnement.plan_change (OPE-867)", () => {
  it("émet l'event outbox avec from/to/montantCents", async () => {
    const repo = makeRepo();
    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await changePlan({ repo }, A, "pro");

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.plan_change");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({ from: "starter", to: "pro" });
    expect(typeof (ev!.payload as Record<string, unknown>)["montantCents"]).toBe("number");
    expect(typeof (ev!.payload as Record<string, unknown>)["dateEffet"]).toBe("string");
  });
});

describe("abonnement.reactivite (OPE-867)", () => {
  it("émet l'event outbox lors de la réactivation", async () => {
    const repo = makeRepo();
    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    await repo.updateCancelAt(A, new Date(Date.now() + 3600_000));

    await reactivateSubscription({ repo }, A);

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.reactivite");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect(ev!.payload).toMatchObject({ planId: "pro" });
    expect(sub).toBeDefined();
  });
});

describe("abonnement.annulation_planifiee (OPE-868)", () => {
  it("émet l'event outbox lors de la planification d'annulation", async () => {
    const repo = makeRepo();
    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "pro", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: new Date(Date.now() + 7 * 24 * 3600_000),
      trialEndsAt: null, paymentMethodId: null,
    });

    await cancelAtPeriodEnd({ repo }, A);

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.annulation_planifiee");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect(typeof (ev!.payload as Record<string, unknown>)["cancelAt"]).toBe("string");
  });
});

describe("abonnement.paiement_echoue (OPE-867, webhook only)", () => {
  it("émet l'event outbox pour un échec non-final via webhook", async () => {
    const repo = makeRepo();
    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    await repo.updateCycleStatus(cycle.id, { status: "pending", attemptCount: 1 });
    await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k1" });
    await repo.updateChargeAttempt(repo.chargeAttempts[0]!.id, { status: "initiated", stripePaymentIntentId: "pi_fail_1" });

    await handleBillingWebhookEvent({ repo }, "payment_intent.payment_failed", "pi_fail_1", null, null, "evt_1");

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.paiement_echoue");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect((ev!.payload as Record<string, unknown>)["tentativeNo"]).toBe(1);
  });
});

describe("abonnement.suspendu_definitif (OPE-939, webhook isFinalAttempt)", () => {
  it("émet l'event outbox lors de la suspension finale via webhook", async () => {
    const repo = makeRepo();
    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    await repo.updateCycleStatus(cycle.id, { status: "pending", attemptCount: MAX_DUNNING_ATTEMPTS });
    await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: MAX_DUNNING_ATTEMPTS, idempotencyKey: "k_final" });
    await repo.updateChargeAttempt(repo.chargeAttempts[0]!.id, { status: "initiated", stripePaymentIntentId: "pi_final_1" });

    await handleBillingWebhookEvent({ repo }, "payment_intent.payment_failed", "pi_final_1", null, null, "evt_final");

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.suspendu_definitif");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect((ev!.payload as Record<string, unknown>)["reason"]).toBe("max_dunning_attempts");
    expect((ev!.payload as Record<string, unknown>)["tentativeNo"]).toBe(MAX_DUNNING_ATTEMPTS);
    const updatedSub = repo.subs.find(s => s.id === sub.id)!;
    expect(updatedSub.status).toBe("past_due");
  });

  it("n'émet pas l'event si la sub est déjà canceled", async () => {
    const repo = makeRepo();
    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "canceled", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    await repo.updateCycleStatus(cycle.id, { status: "pending", attemptCount: MAX_DUNNING_ATTEMPTS });
    await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: MAX_DUNNING_ATTEMPTS, idempotencyKey: "k_final_c" });
    await repo.updateChargeAttempt(repo.chargeAttempts[0]!.id, { status: "initiated", stripePaymentIntentId: "pi_final_c" });

    await handleBillingWebhookEvent({ repo }, "payment_intent.payment_failed", "pi_final_c", null, null, "evt_final_c");

    expect(repo.outboxEvents.find(e => e.action === "abonnement.suspendu_definitif")).toBeUndefined();
  });
});

describe("abonnement.stripe_sync (OPE-937, webhook subscription.updated/created)", () => {
  it("émet l'event outbox pour customer.subscription.updated (stripe_sync)", async () => {
    const repo = makeRepo();
    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "stripe",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await syncSubscriptionFromStripe({ repo }, A.artisanId, "price_pro_monthly", "active");

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.stripe_sync");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect(ev!.payload).toMatchObject({ planId: "pro", statut: "active", stripeStatus: "active" });
  });

  it("émet abonnement.expire (canceled), pas abonnement.stripe_sync", async () => {
    const repo = makeRepo();
    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "stripe",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await syncSubscriptionFromStripe({ repo }, A.artisanId, null, "canceled");

    expect(repo.outboxEvents.find(e => e.action === "abonnement.expire")).toBeDefined();
    expect(repo.outboxEvents.find(e => e.action === "abonnement.stripe_sync")).toBeUndefined();
  });

  it("ignore si billing_mode != 'stripe'", async () => {
    const repo = makeRepo();
    await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    await syncSubscriptionFromStripe({ repo }, A.artisanId, "price_pro_monthly", "active");

    expect(repo.outboxEvents).toHaveLength(0);
  });
});

describe("abonnement.paiement_reussi (OPE-868, webhook only)", () => {
  it("émet l'event outbox pour un paiement réussi via webhook", async () => {
    const repo = makeRepo();
    const sub = await repo.saveSubscription({
      artisanId: A.artisanId, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: new Date("2026-06-01"), currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k1" });
    await repo.updateChargeAttempt(repo.chargeAttempts[0]!.id, { status: "initiated", stripePaymentIntentId: "pi_ok" });

    await handleBillingWebhookEvent({ repo }, "payment_intent.succeeded", "pi_ok", null, null, "evt_ok");

    const ev = repo.outboxEvents.find(e => e.action === "abonnement.paiement_reussi");
    expect(ev).toBeDefined();
    expect(ev!.artisanId).toBe(A.artisanId);
    expect(ev!.payload).toMatchObject({ planId: "starter", montantCents: expect.any(Number) });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { FakeBillingRepository } from "./infra/billing-repository-fake";
import { FakeBillingPort } from "../../shared/ports/billing-adapter";
import {
  chargeOffSessionForCycle,
  recoverZombies,
  runSchedulerTick,
  MaxAttemptsReachedError,
} from "./application/billing-scheduler";
import type { SchedulerDeps } from "./application/billing-scheduler";

const ARTISAN_ID = 1;
const CTX = { artisanId: ARTISAN_ID, userId: 0 };

function makeDeps(): SchedulerDeps & { repo: FakeBillingRepository; billing: FakeBillingPort } {
  const repo = new FakeBillingRepository();
  const billing = new FakeBillingPort();
  return { repo, billing };
}

async function setupActiveSub(repo: FakeBillingRepository) {
  return repo.saveSubscription({
    artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
    status: "active", currentPeriodStart: null, currentPeriodEnd: null,
    trialEndsAt: null, paymentMethodId: null,
  });
}

async function setupPm(repo: FakeBillingRepository, customerId = "cus_test", pmId = "pm_test") {
  const pm = await repo.savePaymentMethod({
    artisanId: ARTISAN_ID, stripeCustomerId: customerId, stripePaymentMethodId: pmId,
    brand: "visa", last4: "4242", expMonth: 12, expYear: 2028, consentedAt: new Date(),
  });
  await repo.setDefaultPaymentMethod(CTX, pm.id);
  return pm;
}

async function setupPendingCycle(repo: FakeBillingRepository, subId: number) {
  return repo.createCycle({
    subscriptionId: subId, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
    amountCents: 2900, currency: "eur",
  });
}

describe("chargeOffSessionForCycle", () => {
  it("succeeded : cycle → paid + cycle suivant créé + subscription.status=active", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    billing.nextChargeResult = { paymentIntentId: "pi_ok", status: "succeeded" };

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const paidCycle = repo.cycles.find(c => c.id === cycle.id)!;
    expect(paidCycle.status).toBe("paid");
    expect(paidCycle.paid_at).toBeTruthy();

    const attempt = repo.chargeAttempts[0]!;
    expect(attempt.status).toBe("succeeded");
    expect(attempt.stripe_payment_intent_id).toBe("pi_ok");

    const ev = repo.events.find(e => e.event_type === "cycle.paid");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({ via: "scheduler", artisanId: ARTISAN_ID });
    expect(typeof (ev!.payload as Record<string, unknown>)["paidAt"]).toBe("string");

    /* Cycle suivant créé automatiquement (anti-régression P0.1) */
    const nextCycle = repo.cycles.find(c => c.status === "pending")!;
    expect(nextCycle).toBeDefined();
    expect(nextCycle.period_start).toEqual(new Date("2026-07-01"));
    expect(nextCycle.amount_cents).toBe(2900);

    /* Subscription avancée à la période suivante */
    const updatedSub = repo.subs.find(s => s.id === sub.id)!;
    expect(updatedSub.status).toBe("active");
    expect(updatedSub.current_period_end).toEqual(new Date("2026-08-01"));

    const periodEv = repo.events.find(e => e.event_type === "subscription.period_advanced");
    expect(periodEv).toBeDefined();
    expect(periodEv!.payload).toMatchObject({ via: "scheduler", artisanId: ARTISAN_ID });
  });

  it("requires_action : traité comme failed (3DS off-session = dunning) + event cycle.requires_action", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    billing.nextChargeResult = { paymentIntentId: "pi_3ds", status: "requires_action", clientSecret: "seti_secret" };

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const updated = repo.cycles.find(c => c.id === cycle.id)!;
    expect(updated.status).toBe("failed");
    expect(updated.next_retry_at).toBeTruthy();

    const attempt = repo.chargeAttempts[0]!;
    expect(attempt.status).toBe("failed");
    expect(attempt.failure_code).toBe("requires_action");

    const ev = repo.events.find(e => e.event_type === "cycle.requires_action");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({ treatedAsFailed: true });
  });

  it("Stripe throw : cycle → failed + nextRetryAt calculé + event charge_failed", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    billing.chargeOffSession = async () => { throw new Error("card_declined"); };

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const updated = repo.cycles.find(c => c.id === cycle.id)!;
    expect(updated.status).toBe("failed");
    expect(updated.failed_at).toBeTruthy();
    expect(updated.next_retry_at).toBeTruthy();

    const ev = repo.events.find(e => e.event_type === "cycle.charge_failed");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({ failureMessage: "card_declined", attemptNo: 1 });
  });

  it("FIX-P — cycle.charge_failed payload inclut failureCode et via:'scheduler'", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);

    /* requires_action transporte failureCode explicite */
    billing.chargeOffSession = async () => ({ paymentIntentId: "pi_3ds", status: "requires_action" });
    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const ev = repo.events.find(e => e.event_type === "cycle.charge_failed");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({ via: "scheduler", failureCode: "requires_action" });
  });

  it("idempotency key format : billing-cycle-{id}-attempt-{n}", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const charge = billing.chargesAttempted[0]!;
    expect(charge.idempotencyKey).toBe(`billing-cycle-${cycle.id}-attempt-1`);
  });

  it("charge créée en DB AVANT l'appel Stripe (anti double-prélèvement)", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);

    let attemptCountAtCallTime = 0;
    const original = billing.chargeOffSession.bind(billing);
    billing.chargeOffSession = async (params) => {
      attemptCountAtCallTime = repo.chargeAttempts.length;
      return original(params);
    };

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    expect(attemptCountAtCallTime).toBe(1);
  });

  it("aucune PM default → cycle failed sans appel Stripe", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    expect(billing.chargesAttempted).toHaveLength(0);
    const updated = repo.cycles.find(c => c.id === cycle.id)!;
    expect(updated.status).toBe("failed");
  });

  it("cycle déjà paid → isDue=false → no-op", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    await repo.updateCycleStatus(cycle.id, { status: "paid", paidAt: new Date() });

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    expect(billing.chargesAttempted).toHaveLength(0);
  });
});

describe("recoverZombies", () => {
  it("zombie PI succeeded → cycle paid", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const zombieStart = new Date(Date.now() - 20 * 60 * 1000);
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: zombieStart });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k1" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_zombie", status: "processing" });
    billing.nextChargeResult = { paymentIntentId: "pi_zombie", status: "succeeded" };

    await recoverZombies({ repo, billing });

    const updated = repo.cycles.find(c => c.id === cycle.id)!;
    expect(updated.status).toBe("paid");
    const ev = repo.events.find(e => e.event_type === "cycle.zombie_recovered");
    expect(ev).toBeDefined();
  });

  it("FIX-W — zombie PI succeeded émet cycle.paid avec via:zombie_recovery + artisanId + paidAt", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const zombieStart = new Date(Date.now() - 20 * 60 * 1000);
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: zombieStart });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k2" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_zombie_w", status: "processing" });
    billing.nextChargeResult = { paymentIntentId: "pi_zombie_w", status: "succeeded" };

    await recoverZombies({ repo, billing });

    const paidEv = repo.events.find(e => e.event_type === "cycle.paid");
    expect(paidEv).toBeDefined();
    expect(paidEv?.payload).toMatchObject({
      via: "zombie_recovery",
      paymentIntentId: "pi_zombie_w",
      artisanId: sub.artisan_id,
    });
    expect(typeof (paidEv?.payload as Record<string, unknown>)["paidAt"]).toBe("string");
  });

  it("cycle charging < 15 min → non zombie, ignoré", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const recentStart = new Date(Date.now() - 5 * 60 * 1000);
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: recentStart });

    await recoverZombies({ repo, billing });

    expect(billing.chargesAttempted).toHaveLength(0);
    const updated = repo.cycles.find(c => c.id === cycle.id)!;
    expect(updated.status).toBe("charging");
  });
});

describe("runSchedulerTick", () => {
  it("cycle pending avec PM → chargé au tick", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    await setupPendingCycle(repo, sub.id);
    billing.nextChargeResult = { paymentIntentId: "pi_tick", status: "succeeded" };

    const result = await runSchedulerTick({ repo, billing });

    expect(result.charged).toBe(1);
    const cycle = repo.cycles[0]!;
    expect(cycle.status).toBe("paid");
  });

  it("sub trialing → cycle ignoré (non due)", async () => {
    const { repo, billing } = makeDeps();
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    await setupPm(repo);
    await setupPendingCycle(repo, sub.id);

    const result = await runSchedulerTick({ repo, billing });

    expect(result.charged).toBe(0);
    expect(billing.chargesAttempted).toHaveLength(0);
  });
});

describe("FIX-2 — billing_interval yearly", () => {
  it("subscription yearly → cycle suivant à +1 an", async () => {
    const { repo, billing } = makeDeps();
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "pro-yearly", billingInterval: "yearly", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    await setupPm(repo);
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-01-01"), periodEnd: new Date("2027-01-01"),
      amountCents: 29000, currency: "eur",
    });
    billing.nextChargeResult = { paymentIntentId: "pi_yr", status: "succeeded" };

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const nextCycle = repo.cycles.find(c => c.status === "pending")!;
    expect(nextCycle).toBeDefined();
    expect(nextCycle.period_start).toEqual(new Date("2027-01-01"));
    expect(nextCycle.period_end).toEqual(new Date("2028-01-01"));

    const updatedSub = repo.subs.find(s => s.id === sub.id)!;
    expect(updatedSub.current_period_end).toEqual(new Date("2028-01-01"));
  });
});

describe("FIX-3 — zombie PI failed passe par handleDunning", () => {
  async function setupZombie(repo: FakeBillingRepository, billing: FakeBillingPort, piStatus: string) {
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const zombieStart = new Date(Date.now() - 20 * 60 * 1000);
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: zombieStart, attemptCount: 1 });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k1" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_z", status: "processing" });
    billing.retrievePaymentIntent = async () => ({ id: "pi_z", status: piStatus, failureCode: "card_declined", failureMessage: "declined" });
    return { sub, cycle };
  }

  it("zombie PI requires_action → cycle failed + event charge_failed", async () => {
    const { repo, billing } = makeDeps();
    await setupZombie(repo, billing, "requires_action");

    await recoverZombies({ repo, billing });

    const cycle = repo.cycles[0]!;
    expect(cycle.status).toBe("failed");
    expect(cycle.next_retry_at).not.toBeNull();
    const ev = repo.events.find(e => e.event_type === "cycle.charge_failed");
    expect(ev).toBeDefined();
  });

  it("zombie PI canceled → cycle failed + event charge_failed", async () => {
    const { repo, billing } = makeDeps();
    await setupZombie(repo, billing, "canceled");

    await recoverZombies({ repo, billing });

    const cycle = repo.cycles[0]!;
    expect(cycle.status).toBe("failed");
    const ev = repo.events.find(e => e.event_type === "cycle.charge_failed");
    expect(ev).toBeDefined();
  });

  it("zombie PI failed à la dernière tentative → subscription.status=past_due", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const zombieStart = new Date(Date.now() - 20 * 60 * 1000);
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: zombieStart, attemptCount: 4 });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 4, idempotencyKey: "k4" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_final", status: "processing" });
    billing.retrievePaymentIntent = async () => ({ id: "pi_final", status: "canceled", failureCode: null, failureMessage: null });

    await recoverZombies({ repo, billing });

    const updatedSub = repo.subs.find(s => s.id === sub.id)!;
    expect(updatedSub.status).toBe("past_due");
    const suspendedEv = repo.events.find(e => e.event_type === "subscription.suspended");
    expect(suspendedEv).toBeDefined();
  });
});

describe("FIX-4 — requires_action : un seul updateChargeAttempt avec failure_code", () => {
  it("failure_code=requires_action présent + failure_message absent après requires_action", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    billing.nextChargeResult = { paymentIntentId: "pi_3ds", status: "requires_action", clientSecret: "cs" };

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const attempt = repo.chargeAttempts[0]!;
    expect(attempt.failure_code).toBe("requires_action");
    expect(attempt.failure_message).toBeNull();
  });
});

describe("FIX-5 — runSchedulerTick.zombiesRecovered compte les zombies traités", () => {
  it("1 zombie récupéré → zombiesRecovered=1", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const zombieStart = new Date(Date.now() - 20 * 60 * 1000);
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: zombieStart });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k1" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_z", status: "processing" });
    billing.nextChargeResult = { paymentIntentId: "pi_z", status: "succeeded" };

    const result = await runSchedulerTick({ repo, billing });

    expect(result.zombiesRecovered).toBe(1);
  });

  it("aucun zombie → zombiesRecovered=0", async () => {
    const { repo, billing } = makeDeps();
    await setupActiveSub(repo);
    await setupPm(repo);

    const result = await runSchedulerTick({ repo, billing });

    expect(result.zombiesRecovered).toBe(0);
  });
});

describe("FIX-6 — PM absente ne consomme pas une tentative de dunning", () => {
  it("sans PM : attempt_count reste 0 + event cycle.no_payment_method", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const updated = repo.cycles.find(c => c.id === cycle.id)!;
    expect(updated.attempt_count).toBe(0);
    expect(billing.chargesAttempted).toHaveLength(0);

    const ev = repo.events.find(e => e.event_type === "cycle.no_payment_method");
    expect(ev).toBeDefined();
  });

  it("PM absente ne bloque pas le dunning réel : 2 tentatives avec PM comptent 2", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    billing.nextChargeResult = null;

    /* 1ère tentative sans PM — ne compte pas */
    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);
    expect(repo.cycles[0]!.attempt_count).toBe(0);

    /* Ajout de la PM */
    await setupPm(repo);
    await repo.updateCycleStatus(cycle.id, { status: "failed", failedAt: new Date(0), nextRetryAt: new Date(0) });

    /* 1ère vraie tentative Stripe */
    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);
    expect(repo.cycles[0]!.attempt_count).toBe(1);
  });
});

describe("FIX-7 — findPendingCycleForPeriod : idempotence par period_start", () => {
  it("double appel succeeded ne crée pas de doublon de cycle suivant", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    billing.nextChargeResult = { paymentIntentId: "pi_ok", status: "succeeded" };

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    /* Simule un webhook redondant qui rappelle advanceSubscriptionAfterPayment */
    billing.nextChargeResult = { paymentIntentId: "pi_ok2", status: "succeeded" };
    const nextCycle = repo.cycles.find(c => c.status === "pending")!;
    /* On force une 2ème avance sur le même paid cycle → ne doit pas doubler */
    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    const pendingCycles = repo.cycles.filter(c => c.status === "pending");
    expect(pendingCycles).toHaveLength(1);
  });

  it("cycle pending stale (ancienne période) n'empêche pas la création du cycle suivant", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);

    /* Cycle payé — période juin */
    const june = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    /* Cycle stale pending d'une ancienne période (mai) — laissé en DB */
    await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-06-01"),
      amountCents: 2900, currency: "eur",
    });
    billing.nextChargeResult = { paymentIntentId: "pi_june", status: "succeeded" };

    await chargeOffSessionForCycle({ repo, billing }, june.id, sub.id, ARTISAN_ID);

    /* Le cycle juillet DOIT être créé malgré le cycle mai pending */
    const julyCycle = repo.cycles.find(c =>
      c.period_start.getTime() === new Date("2026-07-01").getTime() && c.status === "pending"
    );
    expect(julyCycle).toBeDefined();
  });
});

describe("dunning & suspension (IT-3)", () => {
  const MAX_ATTEMPTS = 4;

  async function driveToFinalAttempt(repo: FakeBillingRepository, billing: FakeBillingPort, notifier?: { notifyCalls: number[]; emailCalls: number[] }) {
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    billing.nextChargeResult = null;

    const fakeNotifier = notifier ? {
      notifyArtisan: async (_artisanId: number, _n: unknown) => { notifier.notifyCalls.push(_artisanId); },
      emailArtisanOwner: async (_artisanId: number, _s: string, _h: string) => { notifier.emailCalls.push(_artisanId); },
    } : undefined;

    const deps = { repo, billing, notifier: fakeNotifier };

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      /* Remet le cycle en état "due" (nextRetryAt dans le passé) sans écraser attempt_count */
      const currentCycle = repo.cycles.find(c => c.id === cycle.id)!;
      await repo.updateCycleStatus(cycle.id, {
        status: "failed",
        failedAt: new Date(0),
        nextRetryAt: new Date(0),
        attemptCount: currentCycle.attempt_count,
      });
      await chargeOffSessionForCycle(deps, cycle.id, sub.id, ARTISAN_ID);
    }

    return { sub, cycle };
  }

  it("après 4 tentatives → subscription.status=past_due + event subscription.suspended", async () => {
    const { repo, billing } = makeDeps();
    await driveToFinalAttempt(repo, billing);

    const updatedSub = repo.subs[0]!;
    expect(updatedSub.status).toBe("past_due");

    const suspendedEv = repo.events.find(e => e.event_type === "subscription.suspended");
    expect(suspendedEv).toBeDefined();
    expect(suspendedEv!.payload).toMatchObject({ artisanId: ARTISAN_ID, reason: "max_dunning_attempts" });
  });

  it("notification in-app envoyée à chaque échec", async () => {
    const { repo, billing } = makeDeps();
    const calls = { notifyCalls: [] as number[], emailCalls: [] as number[] };
    await driveToFinalAttempt(repo, billing, calls);

    expect(calls.notifyCalls.length).toBe(MAX_ATTEMPTS);
    expect(calls.emailCalls.length).toBe(MAX_ATTEMPTS);
    calls.notifyCalls.forEach(id => expect(id).toBe(ARTISAN_ID));
  });
});

describe("FIX-A — webhook deduplication", () => {
  it("markWebhookProcessed retourne true sur le 1er appel, false sur le doublon", async () => {
    const { repo } = makeDeps();
    const first = await repo.markWebhookProcessed("evt_001", "payment_intent.succeeded", {});
    const dup = await repo.markWebhookProcessed("evt_001", "payment_intent.succeeded", {});
    expect(first).toBe(true);
    expect(dup).toBe(false);
  });

  it("un webhook succeeded dupliqué ne crée pas un 2ème cycle suivant", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    await repo.updateCycleStatus(cycle.id, { status: "paid", paidAt: new Date() });
    await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k1" });
    await repo.updateChargeAttempt(
      repo.chargeAttempts[0]!.id,
      { stripePaymentIntentId: "pi_ok", status: "succeeded" },
    );

    const { handleBillingWebhookEvent } = await import("./interface/http/billing-webhook-handler");
    /* 1er appel légitime → crée le cycle de la période suivante */
    await handleBillingWebhookEvent({ repo }, "payment_intent.succeeded", "pi_ok", null, null, "evt_dbl");
    const afterFirst = repo.cycles.filter(c => c.status === "pending").length;

    /* 2ème appel dupliqué → bloqué par markWebhookProcessed, aucun nouveau cycle */
    await handleBillingWebhookEvent({ repo }, "payment_intent.succeeded", "pi_ok", null, null, "evt_dbl");
    const afterDup = repo.cycles.filter(c => c.status === "pending").length;

    expect(afterDup).toBe(afterFirst); /* le doublon n'ajoute rien */
  });
});

describe("FIX-S — webhook cycle.paid et subscription.period_advanced incluent artisanId et paidAt (parité scheduler)", () => {
  it("payment_intent.succeeded → cycle.paid payload contient artisanId + paidAt", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: new Date() });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k_s1" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_s1", status: "initiated" });

    const { handleBillingWebhookEvent } = await import("./interface/http/billing-webhook-handler");
    await handleBillingWebhookEvent({ repo }, "payment_intent.succeeded", "pi_s1", null, null, "evt_s1");

    const paidEv = repo.events.find(e => e.event_type === "cycle.paid");
    expect(paidEv).toBeDefined();
    expect(paidEv!.payload).toMatchObject({ artisanId: ARTISAN_ID, via: "webhook" });
    expect(typeof (paidEv!.payload as Record<string, unknown>)["paidAt"]).toBe("string");
  });

  it("payment_intent.succeeded → subscription.period_advanced payload contient artisanId", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    await repo.updateCycleStatus(cycle.id, { status: "charging", chargingStartedAt: new Date() });
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k_s2" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_s2", status: "initiated" });

    const { handleBillingWebhookEvent } = await import("./interface/http/billing-webhook-handler");
    await handleBillingWebhookEvent({ repo }, "payment_intent.succeeded", "pi_s2", null, null, "evt_s2");

    const advEv = repo.events.find(e => e.event_type === "subscription.period_advanced");
    expect(advEv).toBeDefined();
    expect(advEv!.payload).toMatchObject({ artisanId: ARTISAN_ID, via: "webhook" });
  });
});

describe("FIX-B — processing timeout", () => {
  it("cycle bloqué en processing depuis 73h est inclus dans findZombieCycles", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    /* Mettre en processing avec charging_started_at il y a 73h */
    const longAgo = new Date(Date.now() - 73 * 3600_000);
    repo.cycles[0] = {
      ...cycle,
      status: "processing",
      charging_started_at: longAgo,
    };

    const now = new Date();
    const zombies = await repo.findZombieCycles(now);
    expect(zombies.some(c => c.id === cycle.id)).toBe(true);
  });

  it("cycle processing récent (1h) n'est PAS dans findZombieCycles", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    const recent = new Date(Date.now() - 1 * 3600_000);
    repo.cycles[0] = { ...cycle, status: "processing", charging_started_at: recent };

    const zombies = await repo.findZombieCycles(new Date());
    expect(zombies.some(c => c.id === cycle.id)).toBe(false);
  });
});

describe("FIX-C — artisanId=0 guard", () => {
  it("zombie sans subscription connue n'appelle pas handleDunning (cycle → failed)", async () => {
    const { repo, billing } = makeDeps();
    /* Cycle en charging sans sub en DB (sub orpheline) */
    const cycle = await repo.createCycle({
      subscriptionId: 9999,
      periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    repo.cycles[0] = { ...cycle, status: "charging", charging_started_at: longAgo };
    await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k" });
    await repo.updateChargeAttempt(repo.chargeAttempts[0]!.id, { stripePaymentIntentId: "pi_x", status: "initiated" });

    billing.nextRetrieveResult = { status: "canceled", paymentIntentId: "pi_x", failureMessage: null };

    await recoverZombies({ repo, billing });

    const orphanEvent = repo.events.find(e => e.event_type === "cycle.zombie_orphan");
    expect(orphanEvent).toBeDefined();
    /* Aucune notification envoyée à artisanId=0 */
    expect(repo.events.some(e => e.event_type === "subscription.suspended")).toBe(false);
  });
});

describe("FIX-D — BATCH_SIZE : findSubscriptionsWithDueCycles respecte la limite", () => {
  it("avec limit=2 et 5 subs dues, ne retourne que 2", async () => {
    const { repo } = makeDeps();
    for (let i = 1; i <= 5; i++) {
      const sub = await repo.saveSubscription({
        artisanId: i, planId: "starter", billingMode: "maison",
        status: "active", currentPeriodStart: null, currentPeriodEnd: null,
        trialEndsAt: null, paymentMethodId: null,
      });
      await repo.createCycle({
        subscriptionId: sub.id,
        periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
        amountCents: 2900, currency: "eur",
      });
      const pm = await repo.savePaymentMethod({
        artisanId: i, stripeCustomerId: `cus_${i}`, stripePaymentMethodId: `pm_${i}`,
        brand: "visa", last4: "4242", expMonth: 12, expYear: 2028, consentedAt: new Date(),
      });
      await repo.setDefaultPaymentMethod({ artisanId: i, userId: 0 }, pm.id);
    }
    const result = await repo.findSubscriptionsWithDueCycles(new Date(), 2);
    expect(result).toHaveLength(2);
  });
});

describe("FIX-E — no_payment_method retry : délai 24h, pas immédiat", () => {
  it("cycle sans PM a nextRetryAt dans ~24h (pas now)", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    /* Pas de PM enregistré intentionnellement */
    const cycle = await setupPendingCycle(repo, sub.id);

    const before = Date.now();
    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);
    const after = Date.now();

    const updated = repo.cycles.find(c => c.id === cycle.id)!;
    expect(updated.status).toBe("failed");
    /* nextRetryAt doit être dans ~24h, pas dans les prochaines minutes */
    const retryMs = updated.next_retry_at!.getTime();
    const minExpected = before + 23 * 3600_000;
    const maxExpected = after + 25 * 3600_000;
    expect(retryMs).toBeGreaterThan(minExpected);
    expect(retryMs).toBeLessThan(maxExpected);

    /* attempt_count non incrémenté — la PM check ne consomme pas de tentative dunning */
    expect(updated.attempt_count).toBe(0);
  });
});

describe("FIX-F — cancel_at : subscription annulée à période echue n'est pas prélevée", () => {
  it("sub avec cancel_at <= now → cycle skipped + sub canceled, pas de prélèvement Stripe", async () => {
    const { repo, billing } = makeDeps();
    const cancelAt = new Date(Date.now() - 1000);
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "active",
      currentPeriodStart: new Date(Date.now() - 31 * 86400_000),
      currentPeriodEnd: cancelAt,
      trialEndsAt: null, paymentMethodId: null,
    });
    await repo.updateCancelAt(CTX, cancelAt);

    await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: cancelAt,
      periodEnd: new Date(cancelAt.getTime() + 30 * 86400_000),
      amountCents: 2900, currency: "eur",
    });
    const pm = await repo.savePaymentMethod({
      artisanId: ARTISAN_ID, stripeCustomerId: "cus_x", stripePaymentMethodId: "pm_x",
      brand: "visa", last4: "4242", expMonth: 12, expYear: 2028, consentedAt: new Date(),
    });
    await repo.setDefaultPaymentMethod(CTX, pm.id);

    const result = await runSchedulerTick({ repo, billing });

    expect(billing.chargesAttempted).toHaveLength(0);
    expect(result.cancelled).toBe(1);
    expect(result.charged).toBe(0);

    const updatedSub = repo.subs.find(s => s.id === sub.id)!;
    expect(updatedSub.status).toBe("canceled");
    expect(updatedSub.canceled_at).not.toBeNull();

    const skippedCycle = repo.cycles[0]!;
    expect(skippedCycle.status).toBe("skipped");

    const ev = repo.events.find(e => e.event_type === "subscription.canceled");
    expect(ev).toBeDefined();
  });

  it("sub avec cancel_at dans le futur est bien prélevée", async () => {
    const { repo, billing } = makeDeps();
    const futureCancel = new Date(Date.now() + 30 * 86400_000);
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "active",
      currentPeriodStart: new Date("2026-06-01"),
      currentPeriodEnd: new Date("2026-07-01"),
      trialEndsAt: null, paymentMethodId: null,
    });
    await repo.updateCancelAt(CTX, futureCancel);

    await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    const pm = await repo.savePaymentMethod({
      artisanId: ARTISAN_ID, stripeCustomerId: "cus_y", stripePaymentMethodId: "pm_y",
      brand: "visa", last4: "4242", expMonth: 12, expYear: 2028, consentedAt: new Date(),
    });
    await repo.setDefaultPaymentMethod(CTX, pm.id);
    billing.nextChargeResult = { paymentIntentId: "pi_ok", status: "succeeded" };

    const result = await runSchedulerTick({ repo, billing });

    expect(billing.chargesAttempted).toHaveLength(1);
    expect(result.charged).toBe(1);
    expect(result.cancelled).toBe(0);
  });
});

describe("FIX-I — webhook payment_failed respecte MAX_DUNNING_ATTEMPTS", () => {
  async function setupFailedCycleAtMaxAttempts(repo: FakeBillingRepository) {
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    /* Simuler 4 tentatives déjà échouées, cycle abandonné par scheduler */
    repo.cycles[0] = { ...cycle, attempt_count: 4, status: "failed", next_retry_at: null, failed_at: new Date() };
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 4, idempotencyKey: "k4" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_final", status: "initiated" });
    return { sub, cycle: repo.cycles[0]! };
  }

  it("webhook payment_failed au 4ème attempt → nextRetryAt reste null (pas de résurrection)", async () => {
    const { repo } = makeDeps();
    await setupFailedCycleAtMaxAttempts(repo);

    const { handleBillingWebhookEvent } = await import("./interface/http/billing-webhook-handler");
    await handleBillingWebhookEvent({ repo }, "payment_intent.payment_failed", "pi_final", "card_declined", null, "evt_final");

    const cycle = repo.cycles[0]!;
    expect(cycle.next_retry_at).toBeNull(); /* ne pas ressusciter le cycle abandonné */
    expect(cycle.status).toBe("failed");
  });

  it("webhook payment_failed au 4ème attempt → subscription passe en past_due", async () => {
    const { repo } = makeDeps();
    await setupFailedCycleAtMaxAttempts(repo);

    const { handleBillingWebhookEvent } = await import("./interface/http/billing-webhook-handler");
    await handleBillingWebhookEvent({ repo }, "payment_intent.payment_failed", "pi_final", "card_declined", null, "evt_final2");

    const sub = repo.subs[0]!;
    expect(sub.status).toBe("past_due");
  });

  it("webhook payment_failed sur cycle déjà paid → no-op (idempotence scheduler↔webhook)", async () => {
    const { repo } = makeDeps();
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    const cycle = await repo.createCycle({
      subscriptionId: sub.id, periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-07-01"),
      amountCents: 2900, currency: "eur",
    });
    repo.cycles[0] = { ...cycle, status: "paid", paid_at: new Date() };
    const attempt = await repo.createChargeAttempt({ cycleId: cycle.id, attemptNo: 1, idempotencyKey: "k1" });
    await repo.updateChargeAttempt(attempt.id, { stripePaymentIntentId: "pi_paid", status: "succeeded" });

    const { handleBillingWebhookEvent } = await import("./interface/http/billing-webhook-handler");
    await handleBillingWebhookEvent({ repo }, "payment_intent.payment_failed", "pi_paid", null, null, "evt_race");

    /* Le cycle doit rester paid, pas être repassé en failed */
    expect(repo.cycles[0]!.status).toBe("paid");
    expect(repo.subs[0]!.status).toBe("active");
  });
});

describe("FIX-M — claimCycleForCharging : atomic CAS anti double-charge", () => {
  it("premier claim réussit (true) et passe le cycle en charging", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const now = new Date();

    const claimed = await repo.claimCycleForCharging(cycle.id, now, 1);

    expect(claimed).toBe(true);
    expect(repo.cycles[0]!.status).toBe("charging");
    expect(repo.cycles[0]!.attempt_count).toBe(1);
  });

  it("deuxième claim sur même cycle retourne false (race perdue)", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const now = new Date();

    await repo.claimCycleForCharging(cycle.id, now, 1);
    const second = await repo.claimCycleForCharging(cycle.id, now, 1);

    expect(second).toBe(false);
    expect(repo.cycles[0]!.attempt_count).toBe(1);
  });

  it("deux chargeOffSessionForCycle concurrents → 1 seul charge Stripe, 1 seule tentative", async () => {
    /* Simule la race condition multi-réplica : deux appels séquentiels sur le même cycle pending.
       Après le 1er appel (qui claim), le cycle est en charging → isDue=false pour le 2ème. */
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    billing.nextChargeResult = { paymentIntentId: "pi_one", status: "processing" };

    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);
    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    expect(repo.chargeAttempts).toHaveLength(1);
    expect(billing.chargesAttempted).toHaveLength(1);
  });

  it("claim sur cycle failed avec next_retry_at échu retourne true", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const pastRetry = new Date(Date.now() - 1000);
    await repo.updateCycleStatus(cycle.id, { status: "failed", failedAt: pastRetry, nextRetryAt: pastRetry });
    const now = new Date();

    const claimed = await repo.claimCycleForCharging(cycle.id, now, 1);

    expect(claimed).toBe(true);
    expect(repo.cycles[0]!.status).toBe("charging");
  });

  it("claim sur cycle failed avec next_retry_at dans le futur retourne false", async () => {
    const { repo } = makeDeps();
    const sub = await setupActiveSub(repo);
    const cycle = await setupPendingCycle(repo, sub.id);
    const futureRetry = new Date(Date.now() + 3_600_000);
    await repo.updateCycleStatus(cycle.id, { status: "failed", failedAt: new Date(), nextRetryAt: futureRetry });
    const now = new Date();

    const claimed = await repo.claimCycleForCharging(cycle.id, now, 1);

    expect(claimed).toBe(false);
  });
});

describe("FIX-N — activateExpiredTrials : transition trialing→active au tick", () => {
  it("sub trialing avec trial_ends_at échu → active + cycle pending créé", async () => {
    const { repo, billing } = makeDeps();
    const trialEnd = new Date(Date.now() - 3600_000);
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: trialEnd, paymentMethodId: null,
    });

    const result = await runSchedulerTick({ repo, billing });

    expect(result.trialsActivated).toBe(1);
    const updated = repo.subs.find(s => s.id === sub.id)!;
    expect(updated.status).toBe("active");
    const cycle = repo.cycles.find(c => c.subscription_id === sub.id);
    expect(cycle).toBeDefined();
    expect(cycle?.status).toBe("pending");
    expect(cycle?.amount_cents).toBeGreaterThan(0);
    const ev = repo.events.find(e => e.event_type === "subscription.trial_expired");
    expect(ev).toBeDefined();
  });

  it("sub trialing avec trial_ends_at dans le futur → inchangée", async () => {
    const { repo, billing } = makeDeps();
    const futureEnd = new Date(Date.now() + 86_400_000);
    await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: futureEnd, paymentMethodId: null,
    });

    const result = await runSchedulerTick({ repo, billing });

    expect(result.trialsActivated).toBe(0);
    expect(repo.subs[0]!.status).toBe("trialing");
    expect(repo.cycles).toHaveLength(0);
  });

  it("sub trialing sans trial_ends_at → inchangée (pas de date d'expiration)", async () => {
    const { repo, billing } = makeDeps();
    await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });

    const result = await runSchedulerTick({ repo, billing });

    expect(result.trialsActivated).toBe(0);
    expect(repo.subs[0]!.status).toBe("trialing");
  });

  it("idempotent : deuxième tick ne crée pas un deuxième cycle", async () => {
    const { repo, billing } = makeDeps();
    const trialEnd = new Date(Date.now() - 3600_000);
    await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: trialEnd, paymentMethodId: null,
    });

    await runSchedulerTick({ repo, billing });
    await runSchedulerTick({ repo, billing });

    expect(repo.cycles).toHaveLength(1);
  });

  it("trial expiré + PM présente → prélèvement effectué dans le même tick", async () => {
    const { repo, billing } = makeDeps();
    const trialEnd = new Date(Date.now() - 3600_000);
    await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: trialEnd, paymentMethodId: null,
    });
    await setupPm(repo);
    billing.nextChargeResult = { paymentIntentId: "pi_trial_ok", status: "succeeded" };

    const result = await runSchedulerTick({ repo, billing });

    expect(result.trialsActivated).toBe(1);
    expect(result.charged).toBe(1);
    expect(billing.chargesAttempted).toHaveLength(1);
    expect(repo.cycles[0]!.status).toBe("paid");
  });
});

describe("FIX-O — activateExpiredTrials : robustesse ordre + limit", () => {
  it("cycle créé avant updateSubscriptionPeriod : ordre idempotent après échec partiel", async () => {
    /* Simule un 1er tick où le cycle est créé mais findExpiredTrials repick la sub
       (en la remettant trialing manuellement) → le 2ème tick trouve le cycle existant via
       findPendingCycleForPeriod et n'en crée pas un deuxième. */
    const { repo, billing } = makeDeps();
    const trialEnd = new Date(Date.now() - 3600_000);
    await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: trialEnd, paymentMethodId: null,
    });

    await runSchedulerTick({ repo, billing });
    const cycleCountAfterFirst = repo.cycles.length;
    expect(cycleCountAfterFirst).toBe(1);

    /* Remet la sub en trialing pour simuler un second passage (partial failure) */
    await repo.updateSubscriptionStatus(CTX, "trialing");
    await runSchedulerTick({ repo, billing });

    /* Pas de cycle en double */
    expect(repo.cycles).toHaveLength(1);
  });

  it("findExpiredTrials respecte la limite — seuls N subs sont activées par tick", async () => {
    const { repo, billing } = makeDeps();
    const trialEnd = new Date(Date.now() - 3600_000);
    /* Crée 3 subs trialing expirées pour 3 artisans différents */
    for (let i = 1; i <= 3; i++) {
      await repo.saveSubscription({
        artisanId: i, planId: "starter", billingMode: "maison",
        status: "trialing", currentPeriodStart: null, currentPeriodEnd: null,
        trialEndsAt: trialEnd, paymentMethodId: null,
      });
    }

    /* Simule un limit=2 en appelant directement findExpiredTrials */
    const found = await repo.findExpiredTrials(new Date(), 2);
    expect(found).toHaveLength(2);
  });
});

describe("FIX-Q — resumeBillingIfAbandoned : pas de reset attempt_count → pas de collision (cycle_id,attempt_no)", () => {
  it("cycle repris avec attempt_count=4 → attempt_no=5 créé sans collision", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);

    /* Simule un cycle qui a épuisé le dunning (4 tentatives, abandonné) puis repris */
    const cycle = await setupPendingCycle(repo, sub.id);
    repo.cycles[0] = {
      ...cycle,
      status: "pending",
      attempt_count: 4,   /* repris par resumeBillingIfAbandoned, count non réinitialisé */
    };

    /* Pré-remplir les 4 tentatives précédentes pour activer la contrainte UNIQUE simulée */
    for (let n = 1; n <= 4; n++) {
      await repo.createChargeAttempt({
        cycleId: cycle.id,
        attemptNo: n,
        idempotencyKey: `billing-cycle-${cycle.id}-attempt-${n}`,
      });
    }

    billing.nextChargeResult = { paymentIntentId: "pi_resumed", status: "succeeded" };
    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    /* La nouvelle tentative doit être attempt_no=5 (pas de collision avec 1-4) */
    const newAttempt = repo.chargeAttempts.find(a => a.attempt_no === 5);
    expect(newAttempt).toBeDefined();
    expect(billing.chargesAttempted).toHaveLength(1);
    expect(repo.cycles[0]!.status).toBe("paid");
  });

  it("cycle repris → si charge échoue → isFinalAttempt (attempt_no=5 >= MAX=4) → abandonné de nouveau", async () => {
    const { repo, billing } = makeDeps();
    const sub = await setupActiveSub(repo);
    await setupPm(repo);

    const cycle = await setupPendingCycle(repo, sub.id);
    repo.cycles[0] = { ...cycle, status: "pending", attempt_count: 4 };

    billing.chargeOffSession = async () => { throw new Error("insufficient_funds"); };
    await chargeOffSessionForCycle({ repo, billing }, cycle.id, sub.id, ARTISAN_ID);

    /* Charge échouée sur la tentative #5 → isFinalAttempt → nextRetryAt=null (abandonné) */
    const updated = repo.cycles[0]!;
    expect(updated.status).toBe("failed");
    expect(updated.next_retry_at).toBeNull();
    expect(updated.attempt_count).toBe(5);
  });
});

describe("FIX-R — canceled_at positionné lors de l'annulation effective de la subscription", () => {
  it("scheduler cancel_at expiré → canceled_at renseigné avec un timestamp récent", async () => {
    const before = new Date();
    const { repo, billing } = makeDeps();
    const cancelAt = new Date(Date.now() - 5000);
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "active",
      currentPeriodStart: new Date(Date.now() - 31 * 86400_000),
      currentPeriodEnd: cancelAt,
      trialEndsAt: null, paymentMethodId: null,
    });
    await repo.updateCancelAt(CTX, cancelAt);
    await repo.createCycle({
      subscriptionId: sub.id,
      periodStart: cancelAt,
      periodEnd: new Date(cancelAt.getTime() + 30 * 86400_000),
      amountCents: 2900, currency: "eur",
    });
    const pm = await repo.savePaymentMethod({
      artisanId: ARTISAN_ID, stripeCustomerId: "cus_r", stripePaymentMethodId: "pm_r",
      brand: "visa", last4: "0001", expMonth: 12, expYear: 2028, consentedAt: new Date(),
    });
    await repo.setDefaultPaymentMethod(CTX, pm.id);

    await runSchedulerTick({ repo, billing });

    const updatedSub = repo.subs.find(s => s.id === sub.id)!;
    expect(updatedSub.status).toBe("canceled");
    expect(updatedSub.canceled_at).not.toBeNull();
    expect(updatedSub.canceled_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("updateSubscriptionStatus('past_due') ne renseigne pas canceled_at", async () => {
    const { repo } = makeDeps();
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: null, currentPeriodEnd: null,
      trialEndsAt: null, paymentMethodId: null,
    });
    expect(sub.canceled_at).toBeNull();

    await repo.updateSubscriptionStatus(CTX, "past_due");

    const updated = repo.subs.find(s => s.id === sub.id)!;
    expect(updated.status).toBe("past_due");
    expect(updated.canceled_at).toBeNull();
  });
});

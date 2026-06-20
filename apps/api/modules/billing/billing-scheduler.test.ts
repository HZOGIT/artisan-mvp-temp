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

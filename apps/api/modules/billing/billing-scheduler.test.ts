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

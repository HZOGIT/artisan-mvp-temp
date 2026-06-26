import { describe, it, expect, beforeEach } from "vitest";
import { FakeBillingRepository } from "./infra/billing-repository-fake";
import { migrateSubscriptionsFromLegacy } from "./application/billing-migration";
import { subscriptions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../shared/db";

const ARTISAN_ID = 9901;
const FUTURE = new Date(Date.now() + 30 * 24 * 3600_000);
const PAST = new Date(Date.now() - 30 * 24 * 3600_000);

/**
 * Fake minimal pour DbClient : sert les legacy subs et le check d'existence.
 * `billingSubExists` contrôle le retour de la vérification billing_subscriptions.
 */
function makeDb(legacySubs: object[], billingSubExists = false): DbClient {
  return {
    select: (_fields?: unknown) => ({
      from: (table: unknown) => {
        if (table === subscriptions) return Promise.resolve(legacySubs);
        return {
          where: (_cond: unknown) => ({
            limit: (_n: number) => Promise.resolve(billingSubExists ? [{ id: 1 }] : []),
          }),
        };
      },
    }),
  } as unknown as DbClient;
}

function makeLegacySub(overrides: Partial<{
  artisan_id: number;
  status: string;
  plan: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  trial_ends_at: Date | null;
  cancel_at_period_end: boolean;
  stripe_price_id: string | null;
  stripe_subscription_id: string | null;
}> = {}) {
  return {
    id: 1,
    artisan_id: ARTISAN_ID,
    status: "active",
    plan: "starter",
    stripe_price_id: null,
    stripe_subscription_id: null,
    stripe_customer_id: null,
    trial_ends_at: null,
    current_period_start: PAST,
    current_period_end: FUTURE,
    cancel_at_period_end: false,
    max_users: 1,
    max_devices_per_user: 2,
    max_concurrent_sessions: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("migrateSubscriptionsFromLegacy — création de cycles", () => {
  let repo: FakeBillingRepository;

  beforeEach(() => {
    repo = new FakeBillingRepository();
  });

  it("sub active avec current_period_end futur → cycle pending créé", async () => {
    const db = makeDb([makeLegacySub()]);

    const result = await migrateSubscriptionsFromLegacy(db, repo);

    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    expect(repo.cycles).toHaveLength(1);
    const cycle = repo.cycles[0]!;
    expect(cycle.status).toBe("pending");
    expect(cycle.amount_cents).toBe(2900);
    expect(cycle.currency).toBe("eur");
    expect(cycle.period_start).toEqual(PAST);
    expect(cycle.period_end).toEqual(FUTURE);
  });

  it("sub past_due avec current_period_end futur → cycle pending créé", async () => {
    const db = makeDb([makeLegacySub({ status: "past_due" })]);

    await migrateSubscriptionsFromLegacy(db, repo);

    expect(repo.cycles).toHaveLength(1);
    expect(repo.cycles[0]!.status).toBe("pending");
  });

  it("sub trialing → aucun cycle créé (le scheduler gère l'activation du trial)", async () => {
    const db = makeDb([makeLegacySub({ status: "trialing", trial_ends_at: FUTURE })]);

    await migrateSubscriptionsFromLegacy(db, repo);

    expect(repo.cycles).toHaveLength(0);
  });

  it("sub active avec current_period_end passé → aucun cycle créé (période déjà écoulée)", async () => {
    const db = makeDb([makeLegacySub({ current_period_end: PAST })]);

    await migrateSubscriptionsFromLegacy(db, repo);

    expect(repo.cycles).toHaveLength(0);
  });

  it("current_period_start null — migrer 2x → 1 seul cycle (periodStart déterministe)", async () => {
    const sub = makeLegacySub({ current_period_start: null });
    const db = makeDb([sub]);

    await migrateSubscriptionsFromLegacy(db, repo);
    await migrateSubscriptionsFromLegacy(db, repo);

    expect(repo.cycles).toHaveLength(1);
  });

  it("sub active déjà migrée → skippée, aucun cycle créé (idempotent)", async () => {
    const db = makeDb([makeLegacySub()], true);

    const result = await migrateSubscriptionsFromLegacy(db, repo);

    expect(result.skipped).toBe(1);
    expect(result.migrated).toBe(0);
    expect(repo.cycles).toHaveLength(0);
  });

  it("intervalle yearly détecté via durée ≥ 300 jours → amountCents annuel", async () => {
    const yearlyStart = new Date("2026-01-01");
    const yearlyEnd = new Date("2027-01-01");
    const db = makeDb([makeLegacySub({ plan: "pro", current_period_start: yearlyStart, current_period_end: yearlyEnd })]);
    /* yearlyEnd est dans le futur (2027), period est ~365 jours → interval=yearly → 49 000 cts */
    const result = await migrateSubscriptionsFromLegacy(db, repo);

    expect(result.migrated).toBe(1);
    expect(repo.cycles).toHaveLength(1);
    expect(repo.cycles[0]!.amount_cents).toBe(49_000);
  });

  it("cycle idempotent : findPendingCycleForPeriod déjà existant → pas de doublon", async () => {
    const db = makeDb([makeLegacySub()]);
    /* Pré-créer un cycle pour simuler une migration partiellement réussie */
    const sub = await repo.saveSubscription({
      artisanId: ARTISAN_ID, planId: "starter", billingMode: "maison",
      status: "active", currentPeriodStart: PAST, currentPeriodEnd: FUTURE,
      trialEndsAt: null, paymentMethodId: null,
    });
    await repo.createCycle({ subscriptionId: sub.id, periodStart: PAST, periodEnd: FUTURE, amountCents: 2900, currency: "eur" });

    await migrateSubscriptionsFromLegacy(db, repo);

    expect(repo.cycles).toHaveLength(1);
  });
});

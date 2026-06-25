import { describe, it, expect } from "vitest";
import { migrateSubscriptionsFromLegacy } from "./application/billing-migration";
import { FakeBillingRepository } from "./infra/billing-repository-fake";
import { subscriptions, billingSubscriptions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../shared/db";

/** Fake DbClient couvrant les deux requêtes de la migration. */
function makeDb(
  legacySubs: Array<{
    id: number;
    artisan_id: number;
    status: string;
    current_period_start: Date | null;
    current_period_end: Date | null;
    stripe_price_id?: string | null;
    plan?: string | null;
    cancel_at_period_end?: boolean;
    trial_ends_at?: Date | null;
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
    max_users?: number;
    max_devices_per_user?: number;
    max_concurrent_sessions?: number;
    created_at?: Date;
    updated_at?: Date;
  }>,
  migratedArtisanIds: number[] = []
): DbClient {
  const migrated = new Set(migratedArtisanIds);
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === subscriptions) return Promise.resolve(legacySubs);
        /* billingSubscriptions — extrait artisanId via queryChunks[3] */
        return {
          where: (cond: { queryChunks: unknown[] }) => ({
            limit: () => {
              const artisanId = (cond.queryChunks[3] as { value: number }).value;
              return Promise.resolve(migrated.has(artisanId) ? [{ id: 1 }] : []);
            },
          }),
        };
      },
    }),
  } as unknown as DbClient;
}

const now = new Date();
const periodStart = new Date(now.getTime() - 15 * 86400000);
const periodEnd = new Date(now.getTime() + 16 * 86400000);

function makeSub(overrides: Partial<Parameters<typeof makeDb>[0][0]> = {}) {
  return {
    id: 1,
    artisan_id: 42,
    status: "active",
    current_period_start: periodStart,
    current_period_end: periodEnd,
    stripe_price_id: "price_pro_monthly",
    plan: "pro",
    cancel_at_period_end: false,
    trial_ends_at: null,
    stripe_subscription_id: "sub_stripe_123",
    stripe_customer_id: "cus_123",
    max_users: 1,
    max_devices_per_user: 3,
    max_concurrent_sessions: 2,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("migrateSubscriptionsFromLegacy", () => {
  it("sub active → cycle pending créé avec le bon montant", async () => {
    const repo = new FakeBillingRepository();
    const db = makeDb([makeSub()]);

    const result = await migrateSubscriptionsFromLegacy(db, repo);

    expect(result.migrated).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(repo.cycles).toHaveLength(1);
    const cycle = repo.cycles[0]!;
    expect(cycle.status).toBe("pending");
    expect(cycle.amount_cents).toBe(4900); /* pro monthly */
    expect(cycle.currency).toBe("eur");
    expect(cycle.period_start).toEqual(periodStart);
    expect(cycle.period_end).toEqual(periodEnd);
  });

  it("sub trialing → aucun cycle créé", async () => {
    const repo = new FakeBillingRepository();
    const db = makeDb([makeSub({ status: "trialing" })]);

    await migrateSubscriptionsFromLegacy(db, repo);

    expect(repo.cycles).toHaveLength(0);
  });

  it("sub déjà migrée → skippée, aucun cycle créé", async () => {
    const repo = new FakeBillingRepository();
    const db = makeDb([makeSub()], [42]); /* artisan 42 déjà dans billing_subscriptions */

    const result = await migrateSubscriptionsFromLegacy(db, repo);

    expect(result.skipped).toBe(1);
    expect(result.migrated).toBe(0);
    expect(repo.cycles).toHaveLength(0);
  });
});

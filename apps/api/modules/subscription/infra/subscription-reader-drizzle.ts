import { eq, sql } from "drizzle-orm";
import { billingSubscriptions } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db/with-tenant";
import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionReader } from "../application/subscription-reader";
import type { SubscriptionRow } from "../domain/subscription";
import { planLimits } from "../../billing/domain/plan";

type BillingSub = typeof billingSubscriptions.$inferSelect;

function toSubscriptionRow(r: BillingSub): SubscriptionRow {
  const limits = planLimits(r.plan_id as never);
  return {
    id: r.id,
    artisanId: r.artisan_id,
    plan: r.plan_id,
    status: r.status,
    trialEndsAt: r.trial_ends_at ?? null,
    currentPeriodStart: r.current_period_start ?? null,
    currentPeriodEnd: r.current_period_end ?? null,
    cancelAtPeriodEnd: r.cancel_at !== null,
    maxUsers: limits.maxUsers,
    maxDevicesPerUser: limits.maxDevicesPerUser,
    maxConcurrentSessions: limits.maxConcurrentSessions,
  };
}

type LegacyRow = {
  id: number; artisan_id: number; plan: string; status: string;
  trial_ends_at: Date | null; current_period_start: Date | null; current_period_end: Date | null;
  cancel_at_period_end: boolean; max_users: number; max_devices_per_user: number; max_concurrent_sessions: number;
};

function toLegacySubscriptionRow(r: LegacyRow): SubscriptionRow {
  const toDate = (v: unknown) => (v ? new Date(v as string) : null);
  return {
    id: r.id as unknown as number,
    artisanId: r.artisan_id as unknown as number,
    plan: r.plan as unknown as string,
    status: r.status as unknown as string,
    trialEndsAt: toDate(r.trial_ends_at),
    currentPeriodStart: toDate(r.current_period_start),
    currentPeriodEnd: toDate(r.current_period_end),
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    maxUsers: Number(r.max_users) || 1,
    maxDevicesPerUser: Number(r.max_devices_per_user) || 3,
    maxConcurrentSessions: Number(r.max_concurrent_sessions) || 2,
  };
}

/** Lit depuis `billing_subscriptions` (billing maison), avec fallback sur `subscriptions` (legacy). */
export class SubscriptionReaderDrizzle implements ISubscriptionReader {
  constructor(private readonly db: DbClient) {}

  async getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null> {
    const [row] = await withTenant(this.db, ctx, (tx) =>
      tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.artisan_id, ctx.artisanId)).limit(1),
    );
    if (row) return toSubscriptionRow(row);
    const legacy = await this.db.execute(
      sql`SELECT id, artisan_id, plan, status, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, max_users, max_devices_per_user, max_concurrent_sessions FROM subscriptions WHERE artisan_id = ${ctx.artisanId} LIMIT 1`,
    );
    if (!legacy.rows[0]) return null;
    return toLegacySubscriptionRow(legacy.rows[0] as LegacyRow);
  }
}

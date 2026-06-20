import { eq } from "drizzle-orm";
import { billingSubscriptions } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
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

/** Lit depuis `billing_subscriptions` (billing maison). HORS RLS → scope explicite par `artisan_id`. */
export class SubscriptionReaderDrizzle implements ISubscriptionReader {
  constructor(private readonly db: DbClient) {}

  async getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null> {
    const [row] = await this.db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.artisan_id, ctx.artisanId))
      .limit(1);
    return row ? toSubscriptionRow(row) : null;
  }
}

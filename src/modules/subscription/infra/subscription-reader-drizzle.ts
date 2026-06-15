import { eq } from "drizzle-orm";
import { subscriptions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionRepository } from "../application/subscription-reader";
import type { SubscriptionRow } from "../domain/subscription";

type Row = typeof subscriptions.$inferSelect;

function toSubscription(r: Row): SubscriptionRow {
  return {
    id: r.id,
    artisanId: r.artisan_id,
    stripeCustomerId: r.stripe_customer_id ?? null,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
    stripePriceId: r.stripe_price_id ?? null,
    plan: r.plan ?? "trial",
    status: r.status ?? "trialing",
    trialEndsAt: r.trial_ends_at ?? null,
    currentPeriodStart: r.current_period_start ?? null,
    currentPeriodEnd: r.current_period_end ?? null,
    cancelAtPeriodEnd: r.cancel_at_period_end ?? false,
    maxUsers: r.max_users ?? 1,
    maxDevicesPerUser: r.max_devices_per_user ?? 3,
    maxConcurrentSessions: r.max_concurrent_sessions ?? 2,
  };
}

// ⚠️ `subscriptions` est HORS RLS (denylist) → scope EXPLICITE par `artisan_id`.
export class SubscriptionReaderDrizzle implements ISubscriptionRepository {
  constructor(private readonly db: DbClient) {}

  async getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null> {
    const [row] = await this.db.select().from(subscriptions).where(eq(subscriptions.artisan_id, ctx.artisanId)).limit(1);
    return row ? toSubscription(row) : null;
  }

  async setCancelAtPeriodEnd(ctx: TenantContext, cancel: boolean): Promise<void> {
    await this.db.update(subscriptions).set({ cancel_at_period_end: cancel }).where(eq(subscriptions.artisan_id, ctx.artisanId));
  }
}

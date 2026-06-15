import { eq } from "drizzle-orm";
import { artisans, subscriptions } from "../../../../drizzle/schema.pg";
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

  // Upsert sur la clé unique `artisan_id` (la ligne d'abonnement peut ne pas exister au 1er checkout).
  async setStripeCustomerId(ctx: TenantContext, customerId: string): Promise<void> {
    await this.db
      .insert(subscriptions)
      .values({ artisan_id: ctx.artisanId, stripe_customer_id: customerId })
      .onConflictDoUpdate({ target: subscriptions.artisan_id, set: { stripe_customer_id: customerId } });
  }

  async getNomEntreprise(ctx: TenantContext): Promise<string | null> {
    const [a] = await this.db.select({ nom: artisans.nomEntreprise }).from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
    return a?.nom ?? null;
  }
}

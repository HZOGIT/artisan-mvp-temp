import { eq, sql } from "drizzle-orm";
import { subscriptions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { SubscriptionUpsertFields } from "../domain/webhook";
import type { SubscriptionWebhookWriter } from "../application/subscription-webhook-writer";

// Écriture `subscriptions` (HORS RLS — denylist : webhook sans cookie tenant) par `artisan_id` unique.
// L'artisanId est résolu en amont (metadata ou customerId). Upsert via ON CONFLICT(artisan_id).
export class SubscriptionWebhookWriterDrizzle implements SubscriptionWebhookWriter {
  constructor(private readonly db: DbClient) {}

  async getArtisanIdByCustomerId(customerId: string): Promise<number | null> {
    const [r] = await this.db
      .select({ artisanId: subscriptions.artisan_id })
      .from(subscriptions)
      .where(eq(subscriptions.stripe_customer_id, customerId))
      .limit(1);
    return r?.artisanId ?? null;
  }

  async applyUpsert(artisanId: number, f: SubscriptionUpsertFields): Promise<void> {
    const values = {
      artisan_id: artisanId,
      stripe_customer_id: f.stripeCustomerId,
      stripe_subscription_id: f.stripeSubscriptionId,
      stripe_price_id: f.stripePriceId,
      plan: f.plan,
      status: f.status,
      trial_ends_at: f.trialEndsAt,
      current_period_start: f.currentPeriodStart,
      current_period_end: f.currentPeriodEnd,
      cancel_at_period_end: f.cancelAtPeriodEnd,
      max_users: f.maxUsers,
      max_devices_per_user: f.maxDevicesPerUser,
      max_concurrent_sessions: f.maxConcurrentSessions,
      updated_at: new Date(),
    };
    await this.db
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({ target: subscriptions.artisan_id, set: { ...values, artisan_id: sql`${subscriptions.artisan_id}` } });
  }

  async applyDeleted(artisanId: number, f: { plan: string; status: string; cancelAtPeriodEnd: boolean }): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ plan: f.plan, status: f.status, cancel_at_period_end: f.cancelAtPeriodEnd, updated_at: new Date() })
      .where(eq(subscriptions.artisan_id, artisanId));
  }

  async setStatusAndPeriod(artisanId: number, f: { status: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null }): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ status: f.status, current_period_start: f.currentPeriodStart, current_period_end: f.currentPeriodEnd, updated_at: new Date() })
      .where(eq(subscriptions.artisan_id, artisanId));
  }

  async setStatus(artisanId: number, status: string): Promise<void> {
    await this.db.update(subscriptions).set({ status, updated_at: new Date() }).where(eq(subscriptions.artisan_id, artisanId));
  }
}

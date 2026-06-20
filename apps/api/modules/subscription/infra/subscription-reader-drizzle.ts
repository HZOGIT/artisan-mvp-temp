import { eq } from "drizzle-orm";
import { artisans, billingSubscriptions } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionRepository } from "../application/subscription-reader";
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
export class SubscriptionReaderDrizzle implements ISubscriptionRepository {
  constructor(private readonly db: DbClient) {}

  async getSubscription(ctx: TenantContext): Promise<SubscriptionRow | null> {
    const [row] = await this.db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.artisan_id, ctx.artisanId))
      .limit(1);
    return row ? toSubscriptionRow(row) : null;
  }

  async setCancelAtPeriodEnd(_ctx: TenantContext, _cancel: boolean): Promise<void> {
    /* no-op : billing maison gère via billing.cancelAtPeriodEnd / billing.reactivate */
  }

  async setStripeCustomerId(_ctx: TenantContext, _customerId: string): Promise<void> {
    /* no-op : plus de customer Stripe stocké ici */
  }

  async getNomEntreprise(ctx: TenantContext): Promise<string | null> {
    const [a] = await this.db.select({ nom: artisans.nomEntreprise }).from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
    return a?.nom ?? null;
  }
}

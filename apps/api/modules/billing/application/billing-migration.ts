import type { IBillingRepository } from "./billing-repository";
import type { DbClient } from "../../../shared/db";
import { subscriptions, billingSubscriptions } from "../../../../../drizzle/schema.pg";
import { eq, isNull } from "drizzle-orm";

export interface MigrationResult {
  readonly migrated: number;
  readonly skipped: number;
  readonly errors: Array<{ artisanId: number; error: string }>;
}

const STRIPE_PRICE_TO_PLAN: Record<string, string> = {
  starter: "starter",
  pro: "pro",
  enterprise: "enterprise",
};

function mapPlan(stripePriceId: string | null | undefined, legacyPlan: string | null | undefined): string {
  if (stripePriceId) {
    for (const [key, val] of Object.entries(STRIPE_PRICE_TO_PLAN)) {
      if (stripePriceId.toLowerCase().includes(key)) return val;
    }
  }
  if (legacyPlan && legacyPlan !== "trial") {
    const mapped = STRIPE_PRICE_TO_PLAN[legacyPlan.toLowerCase()];
    if (mapped) return mapped;
  }
  return "starter";
}

/**
 * Migre les artisans de la table `subscriptions` (legacy Stripe) vers `billing_subscriptions` (maison).
 * Idempotent : skip si la ligne existe déjà (ON CONFLICT DO NOTHING via unique artisan_id).
 */
export async function migrateSubscriptionsFromLegacy(
  db: DbClient,
  repo: IBillingRepository,
): Promise<MigrationResult> {
  const legacySubs = await db.select().from(subscriptions);

  let migrated = 0;
  let skipped = 0;
  const errors: MigrationResult["errors"] = [];

  for (const sub of legacySubs) {
    try {
      const existing = await db
        .select({ id: billingSubscriptions.id })
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.artisan_id, sub.artisan_id))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const planId = mapPlan(sub.stripe_price_id, sub.plan);
      const cancelAt = sub.cancel_at_period_end && sub.current_period_end
        ? sub.current_period_end
        : null;

      await repo.saveSubscription({
        artisanId: sub.artisan_id,
        planId,
        billingMode: "maison",
        status: sub.status,
        currentPeriodStart: sub.current_period_start ?? null,
        currentPeriodEnd: sub.current_period_end ?? null,
        trialEndsAt: sub.trial_ends_at ?? null,
        paymentMethodId: null,
      });

      if (cancelAt) {
        await repo.updateCancelAt(
          { artisanId: sub.artisan_id, userId: 0 },
          cancelAt,
        );
      }

      await repo.appendEvent({
        entityType: "billing_subscription",
        entityId: sub.artisan_id,
        eventType: "subscription.migrated_from_legacy",
        payload: {
          legacySubId: sub.id,
          stripeSubscriptionId: sub.stripe_subscription_id ?? null,
          planId,
          status: sub.status,
        },
        actor: "migration",
      });

      migrated++;
    } catch (err) {
      errors.push({ artisanId: sub.artisan_id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { migrated, skipped, errors };
}

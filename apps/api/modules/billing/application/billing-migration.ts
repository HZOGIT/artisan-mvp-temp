import type { IBillingRepository } from "./billing-repository";
import type { DbClient } from "../../../shared/db";
import { subscriptions, billingSubscriptions } from "../../../../../drizzle/schema.pg";
import { eq } from "drizzle-orm";
import { planById } from "../domain/plan";

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

export function mapPlan(stripePriceId: string | null | undefined, legacyPlan: string | null | undefined): string {
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
 * Normalise un statut Stripe vers le set valide de billing_subscriptions.
 * Fail-closed : tout statut non explicitement reconnu → past_due (accès restreint, jamais active).
 * Stripe expose : trialing, active, past_due, canceled, unpaid, incomplete, incomplete_expired, paused.
 */
export function normalizeStatus(legacyStatus: string | null | undefined): "trialing" | "active" | "past_due" | "canceled" {
  switch (legacyStatus) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "canceled": return "canceled";
    case "unpaid": return "past_due";
    case "incomplete_expired": return "canceled";
    case "incomplete": return "past_due";
    case "paused": return "past_due";
    default: return "past_due";
  }
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
      const status = normalizeStatus(sub.status);
      const cancelAt = sub.cancel_at_period_end && sub.current_period_end
        ? sub.current_period_end
        : null;

      const savedSub = await repo.saveSubscription({
        artisanId: sub.artisan_id,
        planId,
        billingMode: "maison",
        status,
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

      if ((status === "active" || status === "past_due") && sub.current_period_end && sub.current_period_end > new Date()) {
        const intervalDays = sub.current_period_start
          ? Math.round((sub.current_period_end.getTime() - sub.current_period_start.getTime()) / 86_400_000)
          : 30;
        const interval = intervalDays >= 300 ? "yearly" : "monthly";
        const periodStart = sub.current_period_start ?? new Date(sub.current_period_end.getTime() - intervalDays * 86_400_000);
        const existingCycle = await repo.findPendingCycleForPeriod(savedSub.id, periodStart);
        if (!existingCycle) {
          const plan = planById(planId);
          const amountCents = plan?.amountCentsByInterval[interval] ?? 2900;
          await repo.createCycle({
            subscriptionId: savedSub.id,
            periodStart,
            periodEnd: sub.current_period_end,
            amountCents,
            currency: "eur",
          });
        }
      }

      await repo.appendEvent({
        entityType: "billing_subscription",
        entityId: savedSub.id,
        eventType: "subscription.migrated_from_legacy",
        payload: {
          artisanId: sub.artisan_id,
          legacySubId: sub.id,
          stripeSubscriptionId: sub.stripe_subscription_id ?? null,
          planId,
          status,
          legacyStatus: sub.status,
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

/**
 * OPE-737 — Cleanup one-shot : supprime les billing_subscriptions trialing orphelines
 * rattachées à des artisans soft-deleted (pendingDeletionAt IS NOT NULL).
 *
 * Cause : casSignupNeufNoLoop() dans staging-e2e-mutations.mjs crée un artisan test +
 * une billing_subscription trialing à chaque run, appelle auth.deleteAccount (soft-delete
 * artisan) mais ne supprime pas la sub → 22 orphelines (artisanIds 36-47).
 *
 * Cible : BDD déployée 5433.
 * NE PAS exécuter sur une BDD de production sans vérification préalable.
 *
 * Usage :
 *   DATABASE_URL="postgres://artisan_user:artisan_password@localhost:5433/artisan_mvp" \
 *   pnpm exec tsx scripts/cleanup-orphan-billing-subs.ts
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { artisans } from "../drizzle/schema/artisans";
import { billingCycles, billingEvents, billingSubscriptions } from "../drizzle/schema/billing";

const DB_URL = process.env["DATABASE_URL"];
if (!DB_URL) throw new Error("DATABASE_URL requis");

const pool = new Pool({ connectionString: DB_URL });
const db = drizzle(pool);

const deletedArtisans = await db
  .select({ id: artisans.id })
  .from(artisans)
  .where(isNotNull(artisans.pendingDeletionAt));

if (deletedArtisans.length === 0) {
  console.log("Aucun artisan soft-deleted trouvé.");
  await pool.end();
  process.exit(0);
}

const deletedIds = deletedArtisans.map((a) => a.id);
console.log(`${deletedIds.length} artisan(s) soft-deleted : ids ${deletedIds.join(", ")}`);

const orphanSubs = await db
  .select({ id: billingSubscriptions.id, artisan_id: billingSubscriptions.artisan_id })
  .from(billingSubscriptions)
  .where(and(
    inArray(billingSubscriptions.artisan_id, deletedIds),
    eq(billingSubscriptions.status, "trialing"),
  ));

if (orphanSubs.length === 0) {
  console.log("Aucune billing_subscription trialing orpheline trouvée.");
  await pool.end();
  process.exit(0);
}

const orphanSubIds = orphanSubs.map((s) => s.id);
console.log(`${orphanSubs.length} orpheline(s) trialing : sub ids ${orphanSubIds.join(", ")}`);

const hasCycles = await db
  .select({ id: billingCycles.id })
  .from(billingCycles)
  .where(inArray(billingCycles.subscription_id, orphanSubIds))
  .limit(1);

if (hasCycles.length > 0) {
  console.error("ABORT : des billing_cycles existent pour ces subs — vérification manuelle requise.");
  await pool.end();
  process.exit(1);
}

const eventsDeleted = await db
  .delete(billingEvents)
  .where(and(eq(billingEvents.entity_type, "billing_subscription"), inArray(billingEvents.entity_id, orphanSubIds)))
  .returning({ id: billingEvents.id });

const subsDeleted = await db
  .delete(billingSubscriptions)
  .where(inArray(billingSubscriptions.id, orphanSubIds))
  .returning({ id: billingSubscriptions.id });

console.log(`Supprimé : ${eventsDeleted.length} billing_event(s), ${subsDeleted.length} billing_subscription(s).`);
await pool.end();

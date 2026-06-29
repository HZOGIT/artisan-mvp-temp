/**
 * OPE-720 — Backfill one-shot : passe les abonnements trialing expirés sans PM → past_due.
 * Cible : ids 1,2,3,5 sur la BDD 5433 (déployée).
 * NE PAS exécuter en production sans vérification préalable.
 *
 * Usage :
 *   DATABASE_URL="postgres://artisan_user:...@localhost:5433/artisan_mvp" \
 *   pnpm exec tsx scripts/backfill-trial-no-pm.ts
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray, isNull, lte, and } from "drizzle-orm";
import { billingSubscriptions } from "../drizzle/schema/billing";

const DB_URL = process.env["DATABASE_URL"];
if (!DB_URL) throw new Error("DATABASE_URL requis");

const pool = new Pool({ connectionString: DB_URL });
const db = drizzle(pool);

const now = new Date();

const blocked = await db
  .select({ id: billingSubscriptions.id, artisan_id: billingSubscriptions.artisan_id, trial_ends_at: billingSubscriptions.trial_ends_at })
  .from(billingSubscriptions)
  .where(and(
    eq(billingSubscriptions.status, "trialing"),
    isNull(billingSubscriptions.payment_method_id),
    lte(billingSubscriptions.trial_ends_at, now),
  ));

if (blocked.length === 0) {
  console.log("Aucun abonnement à corriger.");
  await pool.end();
  process.exit(0);
}

console.log(`${blocked.length} abonnement(s) à corriger :`, blocked.map(s => s.id));

const ids = blocked.map(s => s.id);
await db
  .update(billingSubscriptions)
  .set({ status: "past_due", trial_ends_at: null, updated_at: new Date() })
  .where(inArray(billingSubscriptions.id, ids));

console.log(`OK — ${ids.length} abonnement(s) passés past_due : ids ${ids.join(", ")}`);

await pool.end();

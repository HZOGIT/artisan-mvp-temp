/**
 * One-shot : migre les subscriptions legacy → billing_subscriptions (maison).
 * Usage : DATABASE_URL=... APP_DATABASE_URL=... npx tsx scripts/migrate-billing-to-maison.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../drizzle/schema.pg";
import { BillingRepositoryDrizzle } from "../apps/api/modules/billing/infra/billing-repository-drizzle";
import { migrateSubscriptionsFromLegacy } from "../apps/api/modules/billing/application/billing-migration";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error("DATABASE_URL manquante"); process.exit(1); }

const pool = new Pool({ connectionString: dbUrl });
const db = drizzle(pool, { schema });
const repo = new BillingRepositoryDrizzle(db);

console.log("▶ Migration billing legacy → maison…");
const result = await migrateSubscriptionsFromLegacy(db, repo);
console.log(`✓ migrated: ${result.migrated} | skipped: ${result.skipped} | errors: ${result.errors.length}`);
if (result.errors.length > 0) {
  console.error("Erreurs :", result.errors);
  process.exit(1);
}
await pool.end();

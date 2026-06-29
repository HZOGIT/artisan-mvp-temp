/**
 * One-shot idempotent : backfill pdfFileId pour les factures émises sans PDF stocké.
 *
 * Usage :
 *   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
 *   OVH_S3_BUCKET=operioz-staging OVH_S3_ENDPOINT=... OVH_S3_ACCESS_KEY=... OVH_S3_SECRET_KEY=... \
 *   pnpm exec tsx scripts/backfill-facture-pdf.ts
 *
 * NE PAS exécuter en production sans validation humaine préalable.
 * La connexion utilise le rôle owner (DATABASE_URL) pour traverser tous les tenants.
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { DbClient } from "../apps/api/shared/db";
import { backfillFacturePdf } from "../apps/api/modules/factures/application/backfill-facture-pdf";
import { OvhS3Adapter } from "../apps/api/shared/storage/ovh-s3-adapter";
import { JsPdfAdapter } from "../apps/api/shared/pdf/js-pdf-adapter";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error("DATABASE_URL manquante"); process.exit(1); }

const pool = new Pool({ connectionString: dbUrl });
const db = drizzle(pool) as DbClient;
const storage = new OvhS3Adapter(db);
const pdf = new JsPdfAdapter();

console.log("▶ Backfill pdfFileId des factures émises sans PDF stocké…");
const { traites, skips, erreurs } = await backfillFacturePdf(db, storage, pdf);
console.log(`✓ traités: ${traites} | skippés: ${skips} | erreurs: ${erreurs}`);
await pool.end();
if (erreurs > 0) process.exit(1);

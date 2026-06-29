/**
 * Backfill OPE-721 (Type A) : clôture les portails de signature `en_attente`
 * pour les 7 devis déjà `accepte` sans signature correspondante.
 *
 * Usage :
 *   DATABASE_URL=postgres://artisan_user:...@host:5433/artisan_mvp \
 *   pnpm exec tsx scripts/backfill-close-signatures-devis-acceptes.ts
 *
 * Script ONE-SHOT — NE PAS exécuter automatiquement au déploiement.
 * Idempotent : WHERE statut='en_attente' garantit qu'une 2ᵉ exécution ne fait rien.
 */
import { Pool } from "pg";

const TARGET_IDS = [1, 8, 9, 10, 11, 14, 20];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requis (rôle owner artisan_user)");
  const pool = new Pool({ connectionString: url });
  try {
    const result = await pool.query(
      `UPDATE signatures_devis
         SET statut = 'annulee'
       WHERE "devisId" = ANY($1::int[])
         AND statut = 'en_attente'`,
      [TARGET_IDS],
    );
    console.log(`Backfill OPE-721 : ${result.rowCount} signature(s) clôturée(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

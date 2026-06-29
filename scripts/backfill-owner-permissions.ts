/**
 * Backfill one-shot — permissions manquantes pour les propriétaires existants.
 *
 * Pour chaque user role='artisan' dont l'artisanId pointe vers un artisan
 * dont le userId est lui-même (= propriétaire), insère les permissions
 * manquantes via INSERT ON CONFLICT DO NOTHING.
 *
 * Usage :
 *   DATABASE_URL=postgres://artisan_user:...@host:5432/artisan_mvp \
 *   pnpm exec tsx scripts/backfill-owner-permissions.ts
 *
 * Idempotent — peut être rejoué sans risque.
 * NE PAS EXÉCUTER EN PROD SANS VÉRIFICATION PRÉALABLE (voir OPE-718).
 */
import { Pool } from "pg";
import { ALL_PERMISSIONS } from "../packages/contract/permissions";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL requis");

const pool = new Pool({ connectionString: url });

async function main() {
  const client = await pool.connect();
  try {
    const { rows: owners } = await client.query<{ id: number }>(
      `SELECT u.id
       FROM users u
       JOIN artisans a ON a."userId" = u.id
       WHERE u.role = 'artisan'
         AND u."artisanId" = a.id`,
    );
    console.log(`Propriétaires trouvés : ${owners.length}`);

    let inserted = 0;
    for (const { id: userId } of owners) {
      const result = await client.query(
        `INSERT INTO permissions_utilisateur ("userId", permission, autorise)
         SELECT $1, unnest($2::text[]), true
         ON CONFLICT ("userId", permission) DO NOTHING`,
        [userId, ALL_PERMISSIONS],
      );
      inserted += result.rowCount ?? 0;
    }
    console.log(`Permissions insérées : ${inserted}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

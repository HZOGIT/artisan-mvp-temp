import type { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Clé du verrou consultatif (constante arbitraire) sérialisant la provision entre processus :
 * deux conteneurs qui bootent en parallèle ne migrent jamais en même temps.
 */
const PROVISION_LOCK_KEY = 720916;

/** Dossier des migrations Drizzle (SQL + meta/_journal.json). Relatif au cwd (= `/app` en conteneur). */
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "drizzle/pg";

/**
 * Exécute `fn` en tenant un `pg_advisory_lock` (session-scoped) sur une connexion dédiée.
 * Les autres processus qui demandent la même clé bloquent jusqu'au unlock → exclusion mutuelle
 * inter-processus de la phase de provision (migrate + grants).
 */
export async function withProvisionLock<T>(pool: Pool, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [PROVISION_LOCK_KEY]);
    return await fn();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [PROVISION_LOCK_KEY]);
    client.release();
  }
}

/** Applique les migrations Drizzle (schéma + RLS) via le SDK, sous la connexion owner fournie. */
export async function runMigrations(ownerPool: Pool): Promise<void> {
  await migrate(drizzle(ownerPool), { migrationsFolder: MIGRATIONS_DIR });
}

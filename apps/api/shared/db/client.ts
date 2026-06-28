import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getSecret } from "../config/secrets";

/** Le nouveau stack est PostgreSQL-only : pas d'indirection de dialecte ici. */
export type DbClient = NodePgDatabase<Record<string, never>>;

export interface DbHandle {
  readonly db: DbClient;
  readonly pool: Pool;
  close(): Promise<void>;
}

/*
 * Construit un client Drizzle (node-postgres) à partir d'une connection string.
 * Injectable → testable, sans singleton imposé.
 */
export function createDbClient(connectionString: string, max = 10): DbHandle {
  const pool = new Pool({ connectionString, max });
  pool.on("connect", (client) => {
    client.query("SET TIME ZONE 'Europe/Paris'").catch(() => {});
  });
  const db = drizzle(pool);
  return { db, pool, close: () => pool.end() };
}

/*
 * Client par défaut (lazy) du runtime. Il utilise EXCLUSIVEMENT APP_DATABASE_URL — le rôle
 * applicatif NON-superuser soumis à la RLS. Pas de fallback owner (fail-closed) : un mauvais
 * câblage ne doit jamais servir les requêtes en owner et désactiver l'isolation tenant. En test,
 * APP_DATABASE_URL est posé sur le rôle app_tenant par le setup vitest (vitest.setup.api.ts).
 */
let defaultHandle: DbHandle | null = null;
export function getDbHandle(): DbHandle {
  if (defaultHandle) return defaultHandle;
  const url = getSecret("APP_DATABASE_URL");
  if (!url) {
    throw new Error(
      "APP_DATABASE_URL manquant — le runtime DOIT utiliser le rôle applicatif non-superuser (RLS)",
    );
  }
  defaultHandle = createDbClient(url);
  return defaultHandle;
}

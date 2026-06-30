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
    client.query("SET TIME ZONE 'Europe/Paris'").catch(() => { /* ponytail: best-effort — connexion utilisable même sans timezone */ });
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

/*
 * Pool owner (artisan_user) — bypass FORCE ROW LEVEL SECURITY (rolbypassrls=true).
 * Usage STRICTEMENT RESTREINT aux modules cross-tenant (platformAdmin). Ne jamais injecter
 * ce handle dans une procédure tenant-scoped : le bypass désactiverait l'isolation.
 */
let ownerHandle: DbHandle | null = null;
export function getOwnerDbHandle(): DbHandle {
  if (ownerHandle) return ownerHandle;
  const url = getSecret("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL manquant — le pool owner est requis pour les requêtes cross-tenant (platformAdmin)");
  }
  ownerHandle = createDbClient(url, 2);
  return ownerHandle;
}

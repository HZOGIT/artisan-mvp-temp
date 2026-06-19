import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

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
  const db = drizzle(pool);
  return { db, pool, close: () => pool.end() };
}

/*
 * Client par défaut (lazy). Le nouveau stack utilise en priorité APP_DATABASE_URL
 * (rôle applicatif NON-superuser soumis à la RLS) ; à défaut DATABASE_URL. Le legacy,
 * lui, garde DATABASE_URL (rôle superuser qui bypasse la RLS) — non impacté.
 */
let defaultHandle: DbHandle | null = null;
export function getDbHandle(): DbHandle {
  if (defaultHandle) return defaultHandle;
  const url = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("APP_DATABASE_URL / DATABASE_URL manquant");
  defaultHandle = createDbClient(url);
  return defaultHandle;
}

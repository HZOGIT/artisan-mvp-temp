import type { DbClient } from "../db";

/**
 * Exécute `fn` dans une transaction Drizzle (outerTx).
 * Le repo reçoit `repo.withDb(outerTx)` → ses queries font partie de la même tx.
 * outboxEvent(outerTx, ...) dans `fn` → atomicité mutation + outbox garantie.
 * Si `db` est absent : `fn` reçoit le repo original et `undefined` (dégradé, pas d'outbox).
 */
export function withOutbox<TRepo extends { withDb(db: DbClient): TRepo }, T>(
  db: DbClient | undefined,
  repo: TRepo,
  fn: (r: TRepo, tx: DbClient | undefined) => Promise<T>,
): Promise<T> {
  if (!db) return fn(repo, undefined);
  return db.transaction((outerTx) => fn(repo.withDb(outerTx), outerTx as unknown as DbClient));
}

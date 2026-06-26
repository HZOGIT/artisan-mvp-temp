import type { DbClient } from "../db";

/**
 * Invariant : mutation métier ET outbox sont soit **tous les deux commités, soit tous les deux rollbackés**.
 * Si `fn` lance une erreur, `db.transaction()` fait un ROLLBACK complet — ni la mutation ni l'outbox ne persistent.
 * Si `db` est absent : `fn` reçoit le repo original et `undefined` (mode dégradé sans outbox).
 */
export function withOutbox<TRepo extends { withDb(db: DbClient): TRepo }, T>(
  db: DbClient | undefined,
  repo: TRepo,
  fn: (r: TRepo, tx: DbClient | undefined) => Promise<T>,
): Promise<T> {
  if (!db) return fn(repo, undefined);
  return db.transaction((outerTx) => fn(repo.withDb(outerTx), outerTx as unknown as DbClient));
}

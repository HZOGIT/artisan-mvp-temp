import { sql } from "drizzle-orm";
import type { DbClient } from "./client";
import { getDbHandle } from "./client";
import type { TenantContext } from "../tenant";

// Exécute `fn` dans une transaction où la variable de session `app.tenant` vaut
// l'artisanId du contexte (set_config local à la transaction) → active le scoping
// RLS par requête (défense en profondeur contre l'IDOR). La valeur passe en
// paramètre lié (anti-injection). `db` est injecté → testable sans singleton.
export async function withTenant<T>(
  db: DbClient,
  ctx: TenantContext,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant', ${String(ctx.artisanId)}, true)`);
    return fn(tx as unknown as DbClient);
  });
}

// Variante de commodité utilisant le client par défaut (DATABASE_URL). C'est ce
// que les repositories appelleront : `dbForTenant(ctx, (tx) => tx.select()…)`.
export function dbForTenant<T>(
  ctx: TenantContext,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return withTenant(getDbHandle().db, ctx, fn);
}

// Exécute `fn` dans une transaction où la GUC `app.public_token` vaut le token fourni → active la
// policy RLS « accès public PAR TOKEN » (le token EST la capacité). Sert aux endpoints PUBLICS
// (portail/vitrine) sans cookie tenant : la connexion ne voit QUE la ligne dont le token correspond
// (cf. `drizzle/rls/public-token.sql`). ⚠️ Ne JAMAIS y exécuter d'écritures tenant non scopées : une
// fois la ressource résolue (→ artisanId), repasser par `withTenant` pour les effets de bord.
export async function withPublicToken<T>(
  db: DbClient,
  token: string,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.public_token', ${token}, true)`);
    return fn(tx as unknown as DbClient);
  });
}

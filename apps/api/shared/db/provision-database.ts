import { sql } from "drizzle-orm";
import { createDbClient, type DbClient } from "./client";
import { ensureAppRole } from "./ensure-app-role";
import { runMigrations, withProvisionLock } from "./run-migrations";

/**
 * Provisionne la base au démarrage sous le rôle OWNER (`DATABASE_URL`). Sous verrou consultatif :
 * applique les migrations (schéma + RLS) puis (ré)assure le rôle applicatif et ses droits.
 *
 * La connexion owner est ÉPHÉMÈRE — refermée aussitôt. Aucune requête utilisateur n'est jamais
 * servie en owner : le serving se fait sous `app_tenant` (cf. {@link getDbHandle}).
 */
export async function provisionDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (owner) requis pour provisionner la base au démarrage");

  const { pool, close } = createDbClient(url, 2);
  try {
    await withProvisionLock(pool, async () => {
      await runMigrations(pool);
      await ensureAppRole(pool);
    });
  } finally {
    await close();
  }
}

/**
 * Refuse de démarrer si le rôle du pool applicatif peut contourner la RLS (superuser/bypassrls) —
 * empêche tout lancement accidentel en owner (fail-closed : l'isolation tenant ne peut pas être
 * désactivée par un simple mauvais câblage d'environnement).
 */
export async function assertAppRoleExistsAndRestricted(db: DbClient): Promise<void> {
  const res = await db.execute(
    sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const row = res.rows[0] as { rolsuper: boolean; rolbypassrls: boolean } | undefined;
  if (!row) throw new Error("Rôle applicatif introuvable");
  if (row.rolsuper || row.rolbypassrls) {
    throw new Error(
      "Le rôle applicatif peut contourner la RLS (superuser/bypassrls) — démarrage refusé",
    );
  }
}

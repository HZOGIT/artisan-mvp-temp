import type { Pool } from "pg";

/**
 * Provisionne le rôle applicatif NON-superuser (soumis aux policies RLS) à partir des
 * identifiants encodés dans `APP_DATABASE_URL` — garantit par construction que le rôle créé
 * est exactement celui que le pool runtime utilise (source unique, jamais désynchronisé).
 *
 * Idempotent. À exécuter sous une connexion OWNER/admin (`DATABASE_URL`) : seul le propriétaire
 * peut accorder les droits, et CREATE ROLE exige un rôle administrateur.
 */
const ROLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

export async function ensureAppRole(ownerPool: Pool): Promise<void> {
  const appUrl = process.env.APP_DATABASE_URL;
  if (!appUrl) throw new Error("APP_DATABASE_URL requis pour provisionner le rôle applicatif");

  const url = new URL(appUrl);
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!ROLE_NAME_RE.test(role)) throw new Error(`Nom de rôle applicatif invalide : ${role}`);
  if (!password) throw new Error("Mot de passe du rôle applicatif absent de APP_DATABASE_URL");

  const { rows } = await ownerPool.query<{ db: string }>("select current_database() as db");
  const database = rows[0].db;
  const pwLit = `'${password.replace(/'/g, "''")}'`;

  const exists = await ownerPool.query("select 1 from pg_roles where rolname = $1", [role]);
  if (exists.rowCount) {
    await ownerPool.query(`alter role ${role} login password ${pwLit}`);
  } else {
    await ownerPool.query(`create role ${role} login password ${pwLit}`);
  }

  /** Garde-fou : ce rôle ne doit JAMAIS bypasser la RLS (sinon l'isolation tenant saute). */
  await ownerPool.query(`alter role ${role} nosuperuser nobypassrls`);

  await ownerPool.query(`grant connect on database "${database}" to ${role}`);
  await ownerPool.query(`grant usage on schema public to ${role}`);
  await ownerPool.query(`grant select, insert, update, delete on all tables in schema public to ${role}`);
  await ownerPool.query(`grant usage, select on all sequences in schema public to ${role}`);
  /** Tables/séquences créées par les migrations futures (owner) → droits accordés automatiquement. */
  await ownerPool.query(
    `alter default privileges in schema public grant select, insert, update, delete on tables to ${role}`,
  );
  await ownerPool.query(
    `alter default privileges in schema public grant usage, select on sequences to ${role}`,
  );
}

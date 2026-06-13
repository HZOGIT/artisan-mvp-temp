// Crée/configure le rôle applicatif NON-superuser du nouveau stack (celui qui sera
// soumis aux policies RLS). Idempotent. À lancer en superuser.
//
// Env : PG_URL (admin/superuser), APP_DB_USER (def app_tenant), APP_DB_PASSWORD (def app_tenant_pw),
//       PG_DB (def artisan_mvp).
import pg from "pg";

const PG_URL = process.env.PG_URL || process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@127.0.0.1:5432/artisan_mvp";
const ROLE = process.env.APP_DB_USER || "app_tenant";
const PW = process.env.APP_DB_PASSWORD || "app_tenant_pw";
const DB = process.env.PG_DB || "artisan_mvp";

if (!/^[a-z_][a-z0-9_]*$/.test(ROLE)) throw new Error(`Nom de rôle invalide: ${ROLE}`);
const pwLit = `'${PW.replace(/'/g, "''")}'`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();

const { rowCount } = await c.query("select 1 from pg_roles where rolname=$1", [ROLE]);
if (rowCount) {
  await c.query(`alter role ${ROLE} login password ${pwLit}`);
} else {
  await c.query(`create role ${ROLE} login password ${pwLit}`);
}
// Garde-fou : ce rôle ne doit JAMAIS bypasser RLS.
await c.query(`alter role ${ROLE} nosuperuser nobypassrls`);

await c.query(`grant connect on database "${DB}" to ${ROLE}`);
await c.query(`grant usage on schema public to ${ROLE}`);
await c.query(`grant select, insert, update, delete on all tables in schema public to ${ROLE}`);
await c.query(`grant usage, select on all sequences in schema public to ${ROLE}`);
await c.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${ROLE}`);
await c.query(`alter default privileges in schema public grant usage, select on sequences to ${ROLE}`);

const check = await c.query("select rolsuper, rolbypassrls from pg_roles where rolname=$1", [ROLE]);
console.log(`Rôle ${ROLE} prêt : superuser=${check.rows[0].rolsuper} bypassrls=${check.rows[0].rolbypassrls} (doivent être false).`);
await c.end();

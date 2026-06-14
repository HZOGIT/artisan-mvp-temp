// Applique les policies RLS « accès public par token » (drizzle/rls/public-token.sql) sur la base
// cible. Idempotent (DROP POLICY IF EXISTS + CREATE). À exécuter avec un rôle admin/superuser (les
// policies appartiennent au propriétaire des tables).
//
// Usage : PG_URL=postgres://admin:…@host:5432/artisan_mvp node scripts/rls/apply-public-token.mjs
import pg from "pg";
import { readFileSync } from "node:fs";

const PG_URL = process.env.PG_URL || process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@127.0.0.1:5432/artisan_mvp";
const sql = readFileSync("drizzle/rls/public-token.sql", "utf8");

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
await c.query(sql);
const { rows } = await c.query(
  "select polname from pg_policy p join pg_class cl on cl.oid=p.polrelid where cl.relname='demandes_avis' order by polname",
);
console.log(`public-token RLS appliqué sur demandes_avis. Policies : ${rows.map((r) => r.polname).join(", ")}.`);
await c.end();

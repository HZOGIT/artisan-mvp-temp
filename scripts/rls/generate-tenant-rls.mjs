// Génère le SQL d'isolation multi-tenant (Row Level Security) pour toutes les tables
// portant une colonne tenant (artisan_id ou artisanId). Idempotent : DROP POLICY IF
// EXISTS avant CREATE. Émet vers drizzle/rls/tenant-isolation.sql.
//
// Expression de policy : artisan = nullif(current_setting('app.tenant', true), '')::int
// (la GUC revient à '' hors transaction → nullif → null → 0 ligne = deny).
//
// Usage : PG_URL=postgres://… node scripts/rls/generate-tenant-rls.mjs
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";

const PG_URL = process.env.PG_URL || process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@127.0.0.1:5432/artisan_mvp";
const c = new pg.Client({ connectionString: PG_URL });
await c.connect();

const { rows } = await c.query(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public' and column_name in ('artisan_id', 'artisanId')
  order by table_name
`);
await c.end();

const tenantExpr = `nullif(current_setting('app.tenant', true), '')::int`;
const lines = [
  "-- Isolation multi-tenant (RLS) — généré par scripts/rls/generate-tenant-rls.mjs.",
  "-- Idempotent. FORCE ROW LEVEL SECURITY : même le propriétaire est soumis aux policies.",
  "-- Le rôle applicatif du nouveau stack DOIT être NON-superuser (les superusers/BYPASSRLS",
  "-- ignorent RLS). Le legacy (rôle superuser) bypass → non impacté.",
  "",
];
for (const r of rows) {
  const t = `"${r.table_name}"`;
  const col = `"${r.column_name}"`;
  lines.push(`alter table ${t} enable row level security;`);
  lines.push(`alter table ${t} force row level security;`);
  lines.push(`drop policy if exists tenant_isolation on ${t};`);
  lines.push(`create policy tenant_isolation on ${t} using (${col} = ${tenantExpr}) with check (${col} = ${tenantExpr});`);
  lines.push("");
}

mkdirSync("drizzle/rls", { recursive: true });
writeFileSync("drizzle/rls/tenant-isolation.sql", lines.join("\n"));
console.log(`tenant-isolation.sql généré : ${rows.length} tables tenant.`);

// Génère une MIGRATION CUSTOM Drizzle d'isolation multi-tenant (Row Level Security) pour toutes
// les tables portant une colonne tenant (artisan_id ou artisanId). Idempotent : DROP POLICY IF
// EXISTS avant CREATE.
//
// Workflow (option b) : introspecte la base → si l'ensemble des policies tenant a changé depuis
// la dernière migration `*_rls-tenant-isolation.sql` de drizzle/pg/, crée une NOUVELLE migration
// custom (drizzle-kit generate --custom) et y écrit le SQL. Sinon : no-op (rien à régénérer).
// On n'édite JAMAIS une migration déjà appliquée : un changement = un nouveau fichier append.
//
// Expression de policy : artisan = nullif(current_setting('app.tenant', true), '')::int
// (la GUC revient à '' hors transaction → nullif → null → 0 ligne = deny).
//
// Usage : DATABASE_URL=postgres://… DB_DIALECT=postgresql node scripts/rls/generate-tenant-rls.mjs
import pg from "pg";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PG_URL = process.env.PG_URL || process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@127.0.0.1:5432/artisan_mvp";
const c = new pg.Client({ connectionString: PG_URL });
await c.connect();

// Tables identité/auth/plateforme lues HORS contexte tenant (auth, session, device,
// billing par customerId Stripe) → exclues de la RLS tenant (sinon le nouveau stack
// ne pourrait plus authentifier / résoudre le tenant / traiter les webhooks).
/* events + event_outbox = journaux globaux inter-tenant, RLS désactivée explicitement (0040, 0047). */
const DENYLIST = new Set(["users", "active_sessions", "devices", "subscriptions", "events", "event_outbox", "billing_subscriptions"]);

const { rows: allRows } = await c.query(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public' and column_name in ('artisan_id', 'artisanId')
  order by table_name
`);
const rows = allRows.filter((r) => !DENYLIST.has(r.table_name));
const excluded = allRows.filter((r) => DENYLIST.has(r.table_name)).map((r) => r.table_name);
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

// Sécurité dual-stack : sur les tables exclues, désactiver explicitement la RLS
// tenant (au cas où elle aurait été activée par une exécution antérieure).
for (const t of excluded) {
  lines.push(`drop policy if exists tenant_isolation on "${t}";`);
  lines.push(`alter table "${t}" no force row level security;`);
  lines.push(`alter table "${t}" disable row level security;`);
  lines.push("");
}

const PG_DIR = "drizzle/pg";
const TAG = "rls-tenant-isolation";
const BODY_MARKER = "-- Isolation multi-tenant (RLS)";
const body = lines.join("\n").trim();

// En-tête de migration (stable) ; le corps réel commence à BODY_MARKER → comparaison robuste.
const header = [
  "-- Custom migration — RLS isolation multi-tenant (générée par scripts/rls/generate-tenant-rls.mjs).",
  "-- Régénérer après ajout/retrait d'une table tenant = NOUVELLE migration custom (append).",
  "-- NE PAS éditer une migration déjà appliquée. Idempotente (DROP POLICY IF EXISTS + CREATE).",
  "",
  "",
].join("\n");

// Corps de la dernière migration tenant-isolation existante (pour détecter un changement réel).
const previous = readdirSync(PG_DIR)
  .filter((f) => f.endsWith(`_${TAG}.sql`))
  .sort();
const lastBody = previous.length
  ? (() => {
      const sql = readFileSync(`${PG_DIR}/${previous[previous.length - 1]}`, "utf8");
      const i = sql.indexOf(BODY_MARKER);
      return i >= 0 ? sql.slice(i).trim() : "";
    })()
  : "";

if (lastBody === body) {
  console.log(
    `RLS tenant inchangée (${rows.length} tables) vs ${previous[previous.length - 1]} → aucune migration à créer.`,
  );
} else {
  // Crée une migration custom vide + entrée _journal.json + snapshot (drizzle gère le séquençage).
  execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--custom", `--name=${TAG}`], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: PG_URL, DB_DIALECT: "postgresql" },
  });
  const created = readdirSync(PG_DIR)
    .filter((f) => f.endsWith(`_${TAG}.sql`))
    .sort();
  const target = `${PG_DIR}/${created[created.length - 1]}`;
  writeFileSync(target, header + body + "\n");
  console.log(
    `Migration créée : ${target} (${rows.length} tables tenant ; exclues : ${excluded.join(", ") || "—"}).`,
  );
  console.log("→ Relis-la, puis applique : DATABASE_URL=… DB_DIALECT=postgresql pnpm exec drizzle-kit migrate");
}

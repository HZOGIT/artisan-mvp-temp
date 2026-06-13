// scripts/pg-data-copy.mjs — OPE-184 P0.8b
// Copie GÉNÉRIQUE des données MySQL -> PostgreSQL (bascule PG-first).
// Lit chaque table PG (information_schema), copie les lignes depuis MySQL avec
// coercition par type (boolean 0/1->bool, jsonb), puis recale les séquences serial.
// Idempotent : TRUNCATE ... RESTART IDENTITY CASCADE avant insertion.
// FK désactivées le temps du load (session_replication_role = replica).
//
// Usage : node scripts/pg-data-copy.mjs
//   MYSQL_URL (def mysql://artisan_user:artisan_password@127.0.0.1:3306/artisan_mvp)
//   PG_URL    (def postgres://artisan_user:artisan_password@127.0.0.1:5432/artisan_mvp)
import mysql from "mysql2/promise";
import pg from "pg";

const MYSQL_URL = process.env.MYSQL_URL || "mysql://artisan_user:artisan_password@127.0.0.1:3306/artisan_mvp";
const PG_URL = process.env.PG_URL || "postgres://artisan_user:artisan_password@127.0.0.1:5432/artisan_mvp";

const my = await mysql.createConnection(MYSQL_URL);
const pgc = new pg.Client({ connectionString: PG_URL });
await pgc.connect();

// 1) Schéma PG cible : colonnes + types par table (public, base tables)
const { rows: cols } = await pgc.query(`
  select c.table_name, c.column_name, c.data_type, c.ordinal_position
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema=c.table_schema and t.table_name=c.table_name
  where c.table_schema='public' and t.table_type='BASE TABLE'
  order by c.table_name, c.ordinal_position
`);
const pgTables = new Map();
for (const c of cols) {
  if (!pgTables.has(c.table_name)) pgTables.set(c.table_name, []);
  pgTables.get(c.table_name).push({ name: c.column_name, type: c.data_type });
}

// 2) Tables MySQL existantes
const [myTbls] = await my.query(
  "select table_name as t from information_schema.tables where table_schema=database() and table_type='BASE TABLE'"
);
const mysqlSet = new Set(myTbls.map((r) => r.t));

const coerce = (v, type) => {
  if (v === null || v === undefined) return null;
  if (type === "boolean") return !!v;          // mysql 0/1 -> bool
  if (type === "jsonb") return typeof v === "string" ? v : JSON.stringify(v);
  return v;                                      // numeric/timestamp/date/varchar : tels quels
};

const report = [];
await pgc.query("set session_replication_role = replica"); // désactive FK/triggers pendant le load

for (const [table, columns] of pgTables) {
  if (table.startsWith("__")) continue;
  if (!mysqlSet.has(table)) { report.push([table, "SKIP(absente mysql)"]); continue; }
  const names = columns.map((c) => c.name);
  const typeByName = Object.fromEntries(columns.map((c) => [c.name, c.type]));
  const [rows] = await my.query(`select * from \`${table}\``);
  await pgc.query(`truncate table "${table}" restart identity cascade`);
  if (rows.length === 0) { report.push([table, "0"]); continue; }
  // Insert par ligne en N'INCLUANT QUE les colonnes non-null : les colonnes
  // dont la valeur source est null sont omises → PG applique leur DEFAULT
  // (ex. created_at NOT NULL DEFAULT now() en mysql null) ou null (colonnes
  // nullable). Évite "null value violates not-null constraint" sur des données
  // mysql laxistes, sans rien perdre des valeurs réellement présentes.
  for (const row of rows) {
    const present = names.filter((n) => coerce(row[n], typeByName[n]) !== null);
    if (present.length === 0) continue;
    const colList = present.map((n) => `"${n}"`).join(",");
    const ph = present.map((_, i) => `$${i + 1}`).join(",");
    const vals = present.map((n) => coerce(row[n], typeByName[n]));
    await pgc.query(`insert into "${table}" (${colList}) values (${ph})`, vals);
  }
  report.push([table, String(rows.length)]);
}

await pgc.query("set session_replication_role = default");

// 3) Recaler les séquences serial (colonnes id)
for (const [table, columns] of pgTables) {
  if (!mysqlSet.has(table) || !columns.some((c) => c.name === "id")) continue;
  await pgc
    .query(
      `select setval(pg_get_serial_sequence($1,'id'), greatest((select coalesce(max(id),1) from "${table}"),1))`,
      [table]
    )
    .catch((e) => console.warn(`[seq] ${table}: ${e.message}`));
}

console.log("=== copie terminée (table\trows) ===");
for (const [t, n] of report.sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${t}\t${n}`);

await my.end();
await pgc.end();

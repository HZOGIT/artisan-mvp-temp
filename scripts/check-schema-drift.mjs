#!/usr/bin/env node
/**
 * check-schema-drift.mjs — Detect drift between drizzle/schema.ts and the live DB.
 *
 * Compares every column declared in the Drizzle schema against the actual
 * MySQL information_schema. Exits non-zero (and prints the offending
 * tables/columns) when the DB is missing anything the schema expects.
 *
 * Usage:
 *   node scripts/check-schema-drift.mjs            # uses DATABASE_URL
 *   task db:check                                  # via Taskfile
 *
 * Why this exists: the migration history on this project was corrupted by a
 * past mix of `drizzle-kit push` and `drizzle-kit generate`, which silently
 * left ~36 columns in schema.ts that never reached the DB. Every one surfaced
 * later as a runtime "Unknown column" 500. This guard makes drift loud and
 * immediate instead of a production surprise. Run it after any schema change.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', 'drizzle', 'schema.ts');

// Tables intentionally managed outside Drizzle (raw SQL) — skip them.
const IGNORE_TABLES = new Set(['__drizzle_migrations', 'active_sessions', 'devices', 'subscriptions']);

function parseSchema(src) {
  const tables = {};
  const tableRe = /export const \w+ = mysqlTable\(\s*"([^"]+)"\s*,\s*\{/g;
  let m;
  while ((m = tableRe.exec(src)) !== null) {
    const tableName = m[1];
    let depth = 1;
    let pos = tableRe.lastIndex;
    while (pos < src.length && depth > 0) {
      if (src[pos] === '{') depth++;
      else if (src[pos] === '}') depth--;
      pos++;
    }
    const body = src.slice(tableRe.lastIndex, pos - 1);
    const colRe = /\b(?:int|bigint|varchar|text|boolean|timestamp|decimal|json|mysqlEnum|float|double|char|tinyint|smallint|mediumint|longtext|tinytext|mediumtext)\s*\(\s*"([a-zA-Z_][a-zA-Z0-9_]*)"/g;
    const cols = [];
    const seen = new Set();
    let cm;
    while ((cm = colRe.exec(body)) !== null) {
      if (!seen.has(cm[1])) {
        seen.add(cm[1]);
        cols.push(cm[1]);
      }
    }
    tables[tableName] = cols;
  }
  return tables;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ DATABASE_URL not set');
    process.exit(2);
  }

  const schema = parseSchema(readFileSync(SCHEMA_PATH, 'utf8'));
  const conn = await mysql.createConnection(url);
  const dbName = (await conn.query('SELECT DATABASE() AS db'))[0][0].db;

  const [rows] = await conn.query(
    'SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?',
    [dbName],
  );
  await conn.end();

  const dbCols = {};
  for (const r of rows) {
    (dbCols[r.TABLE_NAME] ??= new Set()).add(r.COLUMN_NAME);
  }

  let missingCols = 0;
  const missingTables = [];
  for (const table of Object.keys(schema).sort()) {
    if (IGNORE_TABLES.has(table)) continue;
    if (!dbCols[table]) {
      missingTables.push(table);
      continue;
    }
    const missing = schema[table].filter((c) => !dbCols[table].has(c));
    if (missing.length) {
      console.log(`  MISSING COLUMNS  ${table}: ${missing.join(', ')}`);
      missingCols += missing.length;
    }
  }
  for (const t of missingTables) console.log(`  MISSING TABLE    ${t}`);

  if (missingCols === 0 && missingTables.length === 0) {
    console.log('✅ No schema drift — drizzle/schema.ts and the database are in sync.');
    process.exit(0);
  }

  console.log(`\n❌ Drift detected: ${missingCols} missing column(s), ${missingTables.length} missing table(s).`);
  console.log('   Fix with a proper migration: `task db:generate` then `task db:migrate`,');
  console.log('   or for dev: add the columns and re-run this check.');
  process.exit(1);
}

main().catch((e) => {
  console.error('❌ check-schema-drift failed:', e.message);
  process.exit(2);
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { runMigrations } from "./run-migrations";

/**
 * L2 — runner de migrations Option D contre un vrai PostgreSQL. On crée des BDD temporaires
 * jetables dans le même cluster (rôles partagés) et un dossier de migrations synthétique, pour
 * couvrir chaque branche de façon déterministe sans toucher au schéma applicatif réel.
 */
const URL = process.env.DATABASE_URL;

let adminPool: Pool | null = null;

async function createTempDb(): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `mig_runner_test_${crypto.randomBytes(6).toString("hex")}`;
  await adminPool!.query(`create database ${name}`);
  const url = URL!.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  return {
    url,
    drop: async () => {
      await adminPool!.query(`drop database if exists ${name} with (force)`);
    },
  };
}

function writeFixtures(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migfix-"));
  for (const [name, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), sql);
  }
  return dir;
}

async function withMigrationsDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.MIGRATIONS_DIR;
  process.env.MIGRATIONS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.MIGRATIONS_DIR;
    else process.env.MIGRATIONS_DIR = prev;
  }
}

let available = false;
beforeAll(async () => {
  if (!URL) return;
  adminPool = new Pool({ connectionString: URL, max: 2 });
  try {
    const probe = await createTempDb();
    await probe.drop();
    available = true;
  } catch {
    available = false;
  }
});

afterAll(async () => {
  await adminPool?.end();
});

describe.skipIf(!URL)("runMigrations (Option D — runner SQL horodaté + ledger)", () => {
  it("BDD neuve : applique tous les .sql dans l'ordre, puis re-run = noop idempotent", async () => {
    if (!available) return;
    const dir = writeFixtures({
      "20000101000001_a.sql": "create table mig_a (id int);",
      "20000101000002_b.sql": "create table mig_b (id int);",
    });
    const temp = await createTempDb();
    const pool = new Pool({ connectionString: temp.url, max: 2 });
    try {
      await withMigrationsDir(dir, () => runMigrations(pool));

      const a = await pool.query("select to_regclass('public.mig_a') as t");
      const b = await pool.query("select to_regclass('public.mig_b') as t");
      expect(a.rows[0].t).toBe("mig_a");
      expect(b.rows[0].t).toBe("mig_b");

      const led = await pool.query("select filename from __migrations order by filename");
      expect(led.rows.map((r) => r.filename)).toEqual([
        "20000101000001_a.sql",
        "20000101000002_b.sql",
      ]);

      await withMigrationsDir(dir, () => runMigrations(pool));
      const again = await pool.query("select count(*)::int as n from __migrations");
      expect(again.rows[0].n).toBe(2);
    } finally {
      await pool.end();
      await temp.drop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("BDD déjà provisionnée via Drizzle : bascule par folderMillis, sans ré-exécuter le DDL (même si checksum a divergé)", async () => {
    if (!available) return;
    /**
     * `_a` est marquée appliquée dans Drizzle (when ≤ max created_at), mais son contenu sur
     * disque a été ÉDITÉ depuis (checksum divergent) — cas réel des migrations éditées sur
     * 5432/5433. La bascule DOIT la considérer appliquée (par `when`), pas la ré-exécuter.
     * `_c` a un `when` > max created_at → réellement en attente → appliquée normalement.
     */
    const dir = writeFixtures({
      "20000101000001_a.sql": "create table mig_a (id int, edite_apres_coup int);",
      "20000101000003_c.sql": "create table mig_c (id int);",
    });
    fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "meta", "_journal.json"),
      JSON.stringify({
        entries: [
          { idx: 0, tag: "20000101000001_a", when: 1000 },
          { idx: 1, tag: "20000101000003_c", when: 3000 },
        ],
      }),
    );
    const temp = await createTempDb();
    const pool = new Pool({ connectionString: temp.url, max: 2 });
    try {
      await pool.query("create schema drizzle");
      await pool.query(
        "create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)",
      );
      await pool.query(
        "insert into drizzle.__drizzle_migrations (hash, created_at) values ('peu-importe', 1000)",
      );

      await withMigrationsDir(dir, () => runMigrations(pool));

      const led = await pool.query("select filename from __migrations order by filename");
      expect(led.rows.map((r) => r.filename)).toEqual([
        "20000101000001_a.sql",
        "20000101000003_c.sql",
      ]);

      const a = await pool.query("select to_regclass('public.mig_a') as t");
      expect(a.rows[0].t).toBeNull();
      const c = await pool.query("select to_regclass('public.mig_c') as t");
      expect(c.rows[0].t).toBe("mig_c");
    } finally {
      await pool.end();
      await temp.drop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("post-bascule : migration mergée hors-ordre (timestamp de nom antérieur au max) absente du ledger → EST appliquée (OPE-707)", async () => {
    if (!available) return;
    /**
     * Reproduit l'incident hors-ordre : la bascule est déjà faite (`__migrations` peuplé), le schéma
     * drizzle existe toujours, et une NOUVELLE migration au timestamp de nom ANTÉRIEUR au max du
     * ledger Drizzle est mergée. Son `when` bas la ferait passer pour « déjà couverte » par la
     * bascule → enregistrée-sans-appliquer → colonne fantôme. Elle DOIT au contraire être appliquée.
     */
    const dir = writeFixtures({
      "20000101000001_a.sql": "create table mig_a (id int);",
      "20000101000002_b.sql": "create table mig_b (id int);",
    });
    fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "meta", "_journal.json"),
      JSON.stringify({
        entries: [
          { idx: 0, tag: "20000101000001_a", when: 1000 },
          { idx: 1, tag: "20000101000002_b", when: 2000 },
        ],
      }),
    );
    const temp = await createTempDb();
    const pool = new Pool({ connectionString: temp.url, max: 2 });
    try {
      await pool.query("create schema drizzle");
      await pool.query(
        "create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)",
      );
      await pool.query("insert into drizzle.__drizzle_migrations (hash, created_at) values ('x', 2000)");
      await pool.query(
        "create table __migrations (id serial primary key, filename text not null unique, checksum text not null, applied_at timestamptz not null default now())",
      );
      const bChecksum = crypto
        .createHash("sha256")
        .update("create table mig_b (id int);")
        .digest("hex");
      await pool.query("insert into __migrations (filename, checksum) values ($1, $2)", [
        "20000101000002_b.sql",
        bChecksum,
      ]);
      await pool.query("create table mig_b (id int)");

      await withMigrationsDir(dir, () => runMigrations(pool));

      const a = await pool.query("select to_regclass('public.mig_a') as t");
      expect(a.rows[0].t).toBe("mig_a");
      const led = await pool.query("select filename from __migrations order by filename");
      expect(led.rows.map((r) => r.filename)).toEqual([
        "20000101000001_a.sql",
        "20000101000002_b.sql",
      ]);
    } finally {
      await pool.end();
      await temp.drop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("transition (schéma drizzle présent) : migration pendante dont le DDL existe déjà → tolérée, sans throw", async () => {
    if (!available) return;
    /**
     * Reproduit l'état dev 5432 : ledger Drizzle incomplet (la migration a un `when` > max
     * created_at → classée pendante) MAIS son DDL est déjà présent en base (appliqué hors-bande).
     * Le boot ne doit PAS crasher : le duplicate est avalé, la migration marquée appliquée.
     */
    const dir = writeFixtures({
      "20000101000003_c.sql": "create table mig_c (id int);",
    });
    fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "meta", "_journal.json"),
      JSON.stringify({ entries: [{ idx: 0, tag: "20000101000003_c", when: 3000 }] }),
    );
    const temp = await createTempDb();
    const pool = new Pool({ connectionString: temp.url, max: 2 });
    try {
      await pool.query("create schema drizzle");
      await pool.query(
        "create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)",
      );
      await pool.query("insert into drizzle.__drizzle_migrations (hash, created_at) values ('x', 1000)");
      await pool.query("create table mig_c (id int)");

      await expect(withMigrationsDir(dir, () => runMigrations(pool))).resolves.toBeUndefined();
      const led = await pool.query("select count(*)::int as n from __migrations where filename='20000101000003_c.sql'");
      expect(led.rows[0].n).toBe(1);
    } finally {
      await pool.end();
      await temp.drop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("strict hors transition : un duplicate sur BDD pur-runner (sans schéma drizzle) → throw", async () => {
    if (!available) return;
    const dir = writeFixtures({ "20000101000001_a.sql": "create table mig_a (id int);" });
    const temp = await createTempDb();
    const pool = new Pool({ connectionString: temp.url, max: 2 });
    try {
      await pool.query("create table mig_a (id int)");
      await expect(withMigrationsDir(dir, () => runMigrations(pool))).rejects.toThrow(/already exists|existe/i);
    } finally {
      await pool.end();
      await temp.drop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("-- no-transaction : exécute hors transaction (CREATE INDEX CONCURRENTLY, interdit en bloc)", async () => {
    if (!available) return;
    const dir = writeFixtures({
      "20000101000001_a.sql": "create table mig_a (id int);",
      "20000101000002_idx.sql":
        "-- no-transaction\ncreate index concurrently if not exists mig_a_id_idx on mig_a (id);",
    });
    const temp = await createTempDb();
    const pool = new Pool({ connectionString: temp.url, max: 2 });
    try {
      await withMigrationsDir(dir, () => runMigrations(pool));
      const idx = await pool.query("select to_regclass('public.mig_a_id_idx') as t");
      expect(idx.rows[0].t).toBe("mig_a_id_idx");
      const led = await pool.query("select count(*)::int as n from __migrations");
      expect(led.rows[0].n).toBe(2);
    } finally {
      await pool.end();
      await temp.drop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("checksum mismatch : une migration appliquée puis modifiée → throw", async () => {
    if (!available) return;
    const fileA = "20000101000001_a.sql";
    const dir = writeFixtures({ [fileA]: "create table mig_a (id int);" });
    const temp = await createTempDb();
    const pool = new Pool({ connectionString: temp.url, max: 2 });
    try {
      await withMigrationsDir(dir, () => runMigrations(pool));

      fs.writeFileSync(path.join(dir, fileA), "create table mig_a (id int, n int);");
      await expect(withMigrationsDir(dir, () => runMigrations(pool))).rejects.toThrow(/checksum/);
    } finally {
      await pool.end();
      await temp.drop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

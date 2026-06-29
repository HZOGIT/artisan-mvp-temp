import type { Pool } from "pg";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Clé du verrou consultatif (constante arbitraire) sérialisant la provision entre processus :
 * deux conteneurs qui bootent en parallèle ne migrent jamais en même temps.
 */
const PROVISION_LOCK_KEY = 720916;

/**
 * Dossier des migrations (fichiers `YYYYMMDDHHMMSS_<nom>.sql`). Relatif au cwd (= `/app` en
 * conteneur). Le runner applique les `.sql` triés par nom (= ordre chronologique du timestamp).
 * Lu à l'exécution (pas au chargement) pour rester surchargeable en test via `MIGRATIONS_DIR`.
 */
function migrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? "drizzle";
}

/**
 * Exécute `fn` en tenant un `pg_advisory_lock` (session-scoped) sur une connexion dédiée.
 * Les autres processus qui demandent la même clé bloquent jusqu'au unlock → exclusion mutuelle
 * inter-processus de la phase de provision (migrate + grants).
 */
export async function withProvisionLock<T>(pool: Pool, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [PROVISION_LOCK_KEY]);
    return await fn();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [PROVISION_LOCK_KEY]);
    client.release();
  }
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function migrationFiles(): string[] {
  return fs
    .readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Statements découpés sur `--> statement-breakpoint`, vides retirés. Drizzle insère ce marqueur
 * entre instructions ; le runner l'exploite pour appliquer statement par statement (modes tolérant
 * et `-- no-transaction`).
 */
function splitStatements(content: string): string[] {
  return content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * SQLSTATE « objet déjà présent » tolérés pendant la bascule : `duplicate_column` (42701),
 * `duplicate_table`/relation (42P07), `duplicate_object` — contrainte, index, type, policy,
 * trigger (42710).
 */
const DUPLICATE_OBJECT_CODES = new Set(["42701", "42P07", "42710"]);

/** Le schéma Drizzle (`drizzle.__drizzle_migrations`) est-il présent ? = on hérite d'une BDD gérée par Drizzle. */
async function hasDrizzleLedger(ownerPool: Pool): Promise<boolean> {
  const res = await ownerPool.query(
    "select 1 from information_schema.tables where table_schema = 'drizzle' and table_name = '__drizzle_migrations'",
  );
  return Boolean(res.rowCount);
}

/**
 * Empreinte temporelle (`when` = epoch millis) de chaque migration, par tag, lue depuis
 * `meta/_journal.json`. C'est la clé qu'utilise Drizzle pour décider d'appliquer ou non une
 * migration. Utilisée UNIQUEMENT pour la bascule (transition Drizzle → runner). Absent (dossier
 * de test sans `meta/`) → map vide.
 */
function journalWhenByTag(): Map<string, number> {
  const journalPath = path.join(migrationsDir(), "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) return new Map();
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries?: { tag: string; when: number }[];
  };
  return new Map((journal.entries ?? []).map((e) => [e.tag, e.when]));
}

/**
 * Bascule unique depuis Drizzle. Les BDD déjà provisionnées (dev 5432, déployé 5433) ont tout le
 * DDL appliqué via `drizzle.__drizzle_migrations`. Au 1er boot du runner maison, on peuple
 * `__migrations` pour ces migrations SANS ré-exécuter le SQL (sinon `… already exists` → boot
 * fail-closed → crash-loop).
 *
 * On reproduit EXACTEMENT le critère d'application de Drizzle (cf. `pg-core/dialect.migrate`) :
 * une migration est déjà appliquée ssi son `when` (folderMillis du journal) est ≤ au `created_at`
 * max du ledger Drizzle. On ne peut PAS se fier au checksum : une migration appliquée puis éditée
 * (cas réel sur 5432/5433) garde un `when` inchangé mais un checksum divergent — Drizzle l'a
 * pourtant bien appliquée. Les fichiers au `when` strictement supérieur sont réellement en attente
 * → laissés à la boucle d'application normale.
 *
 * ⚠️ Le critère `when ≤ max` ne vaut QUE pour la bascule one-shot (ledger `__migrations` encore
 * vide) : à ce moment-là, tout fichier au `when` bas a réellement été appliqué par Drizzle. Une
 * fois la bascule faite, une NOUVELLE migration mergée hors-ordre (timestamp de nom antérieur au
 * max) aurait un `when` bas SANS avoir été appliquée → l'enregistrer-sans-appliquer crée une
 * colonne fantôme. C'est pourquoi {@link runMigrations} ne déclenche cette bascule qu'au tout
 * premier boot du runner (ledger vide) ; ensuite, l'apply se décide purement par nom.
 */
async function backfillFromDrizzle(
  ownerPool: Pool,
  files: string[],
  ledger: Map<string, string>,
): Promise<void> {
  const lastApplied = await ownerPool.query<{ max: string | null }>(
    "select max(created_at)::text as max from drizzle.__drizzle_migrations",
  );
  const maxApplied = lastApplied.rows[0]?.max;
  if (maxApplied === null || maxApplied === undefined) return;
  const maxAppliedMillis = Number(maxApplied);

  const whenByTag = journalWhenByTag();

  for (const file of files) {
    if (ledger.has(file)) continue;
    const when = whenByTag.get(file.replace(/\.sql$/, ""));
    if (when === undefined || when > maxAppliedMillis) continue;
    const checksum = sha256(fs.readFileSync(path.join(migrationsDir(), file), "utf8"));
    await ownerPool.query(
      "insert into __migrations (filename, checksum) values ($1, $2) on conflict (filename) do nothing",
      [file, checksum],
    );
    ledger.set(file, checksum);
  }
}

/**
 * Marqueur d'en-tête optant pour une exécution HORS transaction (1ʳᵉ ligne `-- no-transaction`).
 * Nécessaire pour le DDL non-transactionnel de PostgreSQL (`CREATE INDEX CONCURRENTLY`, etc.),
 * interdit dans un bloc transactionnel. Atomicité perdue (cf. {@link applyMigration}).
 */
const NO_TRANSACTION = /^[ \t]*--[ \t]*no-transaction\b/im;

function isDuplicateObjectError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code !== undefined && DUPLICATE_OBJECT_CODES.has(code);
}

const recordLedger = "insert into __migrations (filename, checksum) values ($1, $2)";

/**
 * Applique un fichier de migration et l'inscrit au ledger, sur une connexion dédiée (BEGIN/DDL/
 * INSERT/COMMIT DOIVENT partager la même connexion : `pool.query()` en emprunte une par appel,
 * le DDL tomberait alors hors transaction).
 *
 * - **Mode `-- no-transaction`** : chaque statement (`--> statement-breakpoint`) en auto-commit
 *   (requis pour `CREATE INDEX CONCURRENTLY` & co). Atomicité perdue → statements idempotents.
 * - **Mode tolérant** (`tolerant=true`, bascule depuis une BDD Drizzle) : statement par statement
 *   sous `SAVEPOINT` ; un échec « objet déjà présent » ({@link DUPLICATE_OBJECT_CODES}) est avalé
 *   (DDL déjà appliqué hors-bande / ledger Drizzle incomplet) au lieu de crasher le boot, tout en
 *   restant transactionnel (atomicité préservée par fichier). Toute autre erreur → throw.
 * - **Mode strict** (défaut) : tout le fichier dans un `BEGIN/COMMIT` → atomique ; un duplicate
 *   est une vraie erreur (BDD pur-runner, jamais gérée par Drizzle) → throw.
 */
async function applyMigration(
  ownerPool: Pool,
  file: string,
  content: string,
  checksum: string,
  tolerant: boolean,
): Promise<void> {
  const client = await ownerPool.connect();
  try {
    if (NO_TRANSACTION.test(content)) {
      for (const statement of splitStatements(content)) {
        try {
          await client.query(statement);
        } catch (err) {
          if (!(tolerant && isDuplicateObjectError(err))) throw err;
        }
      }
      await client.query(recordLedger, [file, checksum]);
      return;
    }

    try {
      await client.query("begin");
      if (tolerant) {
        for (const statement of splitStatements(content)) {
          await client.query("savepoint s");
          try {
            await client.query(statement);
            await client.query("release savepoint s");
          } catch (err) {
            if (!isDuplicateObjectError(err)) throw err;
            await client.query("rollback to savepoint s");
          }
        }
      } else {
        await client.query(content);
      }
      await client.query(recordLedger, [file, checksum]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  } finally {
    client.release();
  }
}

/**
 * Applique les migrations SQL (schéma + RLS) sous la connexion owner fournie. Ledger maison
 * `__migrations` (filename + checksum sha256) : chaque fichier s'applique exactement une fois,
 * triées par nom (= ordre chronologique du timestamp). Une migration déjà appliquée dont le
 * contenu a changé → throw (on ne réécrit jamais une migration appliquée).
 */
export async function runMigrations(ownerPool: Pool): Promise<void> {
  await ownerPool.query(`
    create table if not exists __migrations (
      id serial primary key,
      filename text not null unique,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = await ownerPool.query<{ filename: string; checksum: string }>(
    "select filename, checksum from __migrations",
  );
  const ledger = new Map(applied.rows.map((r) => [r.filename, r.checksum]));

  const files = migrationFiles();

  /**
   * Transition = on hérite d'une BDD gérée par Drizzle (5432/5433). Active la bascule (peupler le
   * ledger sans ré-exécuter) ET l'apply tolérant (DDL déjà présent toléré au lieu de crasher le
   * boot sur un état récupérable). Une BDD pur-runner (sans schéma `drizzle`) reste en mode strict.
   */
  const transition = await hasDrizzleLedger(ownerPool);
  /**
   * Bascule one-shot UNIQUEMENT : ledger `__migrations` encore vide = tout premier boot du runner
   * sur une BDD ex-Drizzle. Une fois la bascule faite (ledger peuplé), on ne ré-enregistre plus
   * jamais sans appliquer — toute `.sql` absente du ledger passe par la boucle d'apply, décidée
   * purement par nom de fichier, indépendamment de l'ordre des timestamps des autres entrées.
   */
  if (transition && ledger.size === 0) await backfillFromDrizzle(ownerPool, files, ledger);

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir(), file), "utf8");
    const checksum = sha256(content);

    if (ledger.has(file)) {
      if (ledger.get(file) !== checksum) {
        throw new Error(
          `Migration ${file} : checksum différent de la version appliquée — ne jamais modifier une migration déjà appliquée`,
        );
      }
      continue;
    }

    try {
      await applyMigration(ownerPool, file, content, checksum, transition);
    } catch (err) {
      throw new Error(`Migration ${file} échouée : ${String(err)}`);
    }
  }
}

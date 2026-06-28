# Option D — Runner SQL horodaté + ledger : analyse GO/NO-GO

**Contexte** : Décision humaine 2026-06-28. Résoudre les collisions `_journal.json` quand des
sessions parallèles génèrent des migrations Drizzle. Ce document analyse l'Option D (runner
maison), évalue Flyway comme alternative, et recommande.

Sources :
- Code source lu : `apps/api/shared/db/run-migrations.ts`, `provision-database.ts`,
  `provision-cli.ts`, `server.ts`, `Taskfile.yml`, `drizzle.config.ts`,
  `drizzle/meta/_journal.json`, `node_modules/drizzle-orm/migrator.js`
- Flyway : [github.com/flyway/flyway](https://github.com/flyway/flyway) (dernière version
  12.9.0 du 18 juin 2026, Apache 2.0), [red-gate.com/products/flyway](https://www.red-gate.com/products/flyway/)

---

## 1. Pourquoi `_journal.json` est un problème

Drizzle's `migrate()` (utilisé dans `run-migrations.ts:32`) lit
`drizzle/meta/_journal.json` au boot :

```js
// node_modules/drizzle-orm/migrator.js (extrait)
const journalPath = `${migrationsFolder}/meta/_journal.json`;
const journal = JSON.parse(fs.readFileSync(journalPath).toString());
for (const journalEntry of journal.entries) {
  const query = fs.readFileSync(`${migrationsFolder}/${journalEntry.tag}.sql`).toString();
  // …compute sha256, apply if not in __drizzle_migrations
}
```

Le journal contient des entrées avec un `idx` entier auto-incrémenté. Quand deux worktrees
génèrent une migration simultanément, chacun incrémente `idx` depuis le même dernier état →
collision lors du merge. C'est le bug documenté dans la mémoire
`parallel-migration-collisions-drizzle.md`.

**Point clé déjà en place** : `drizzle.config.ts` utilise déjà `migrations: { prefix: "timestamp" }`
→ les fichiers `.sql` sont déjà nommés `YYYYMMDDHHMMSS_name.sql` (ex.
`20260628202345_rappel-rdv-client.sql`). Les noms de fichiers sont déjà uniques par timestamp.
Le seul problème est le conflit sur `_journal.json`.

---

## 2. Option D — Runner maison : analyse par question

### Q1. Compatibilité avec l'existant

**RLS dans les migrations** : Le runner lit les `.sql` et les exécute via `pool.query()` sans
filtrage. Les instructions `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, etc.
s'exécutent telles quelles. ✅

**pg-boss** : pg-boss démarre dans `server.ts` APRÈS `await provisionDatabase()` (lignes 22-29
de server.ts). Le runner remplace uniquement l'appel interne à `migrate()` — l'ordre de boot
est inchangé. ✅

**`pg_advisory_lock`** : La clé 720916 et `withProvisionLock()` restent dans
`run-migrations.ts`, inchangés. Le runner tourne à l'intérieur du verrou. ✅

**`task db:provision`** : Appelle `provision-cli.ts` → `provisionDatabase()` →
`runMigrations(pool)`. Seule l'implémentation de `runMigrations()` change. Aucune modification
de `Taskfile.yml`. ✅

**BDD test e2e (5432)** : Même chemin que ci-dessus. ✅

**Boot fail-closed** : Si le runner échoue (SQL error, ledger inaccessible), la promesse
rejette → `provisionDatabase()` throw → `server.ts` crash → le serveur ne démarre pas.
Comportement identique à Drizzle. ✅

### Q2. Dépendances résiduelles à `_journal.json` / snapshots `meta/`

Grep exhaustif dans le repo (hors `node_modules`) sur `_journal`, `journal.json`, `drizzle/meta` :

| Fichier | Usage | Statut sous Option D |
|---|---|---|
| `apps/api/shared/db/run-migrations.ts:11` | Commentaire JSDoc seulement | À mettre à jour (commentaire) |
| `scripts/rls/generate-tenant-rls.mjs:96` | Commentaire : explique que `drizzle-kit generate --custom` écrit le journal | `drizzle-kit generate --custom` continue à scaffolder le `.sql` — le journal est écrit mais **ignoré au runtime** |
| `node_modules/drizzle-orm/migrator.js` | Lecture du journal (code Drizzle) | Supprimé (on retire l'appel à `migrate()`) |

Snapshots `meta/*.json` : lus uniquement par `drizzle-kit` CLI pour calculer les diffs de
schéma. Non utilisés au runtime. Inchangés. ✅

**Aucun CI, aucun test, aucun code applicatif** ne lit `_journal.json` directement.

### Q3. `drizzle-kit generate --custom` reste-t-il utilisable ?

**Oui, directement.** Grâce à `migrations: { prefix: "timestamp" }` dans `drizzle.config.ts`,
`drizzle-kit generate --custom --name=<nom>` produit déjà un fichier
`YYYYMMDDHHMMSS_<nom>.sql` — nom horodaté au format requis par le runner.

- `generate-tenant-rls.mjs` continue à appeler `drizzle-kit generate --custom` pour créer
  le squelette → toujours valide. Le `.sql` créé est directement utilisable par le runner.
- Le journal `_journal.json` est mis à jour par drizzle-kit (comme avant) mais devient un
  artéfact de dev purement indicatif, pas une dépendance runtime.
- Le worker peut continuer à versionner `_journal.json` dans git pour garder la traçabilité
  (aucun coût).

**Alternative si drizzle-kit est retiré un jour** : un simple `date '+%Y%m%d%H%M%S'` + touch
suffit pour créer un fichier horodaté. Mais rien ne justifie ce changement maintenant.

### Q4. Edge cases

**Checksum drift** (fichier modifié après application) :
Le runner stocke le SHA-256 dans `__migrations`. À chaque boot, il relit les fichiers appliqués
et compare les checksums. Si divergence → **throw** (fail-closed). C'est le comportement
de Drizzle et la règle existante ("ne jamais éditer une migration appliquée"). Pour le dev,
une variable `MIGRATION_STRICT=false` peut désactiver le throw, mais le défaut doit être strict.

**Migration partiellement appliquée** (crash au milieu) :
Dans PostgreSQL, le DDL est transactionnel. Le runner doit envelopper chaque migration dans
une transaction atomique : `BEGIN; [SQL migration]; INSERT INTO __migrations; COMMIT;`. Si le
serveur crash entre les deux, la transaction est rollbackée → migration absente du ledger →
réappliquée au prochain boot. **Condition** : le SQL de migration doit être idempotent ou
le DDL doit être dans un `BEGIN/COMMIT` (ce que PostgreSQL garantit).

Nos fichiers `.sql` actuels contiennent des marqueurs `--> statement-breakpoint`. Drizzle les
utilise pour splitter le SQL en statements individuels (pour compatibilité multi-DB). Sous
Option D, le runner peut :
- Ignorer le marqueur et exécuter le fichier entier dans une transaction (PostgreSQL DDL est
  transactionnel → safe).
- OU splitter sur `--> statement-breakpoint` et exécuter statement par statement dans la
  même transaction.

La première option est plus simple (~2 lignes) et correcte pour PostgreSQL.

**Égalités/ordre de timestamp** :
Deux fichiers avec le même timestamp (même seconde) sont triés alphabétiquement par nom
complet → ordre déterministe. Cas pratiquement impossible avec deux humains en parallèle,
mais géré sans ambiguïté.

**Rollback** :
Ni Drizzle Community, ni le runner maison ne supportent le rollback automatique. Même
limitation qu'aujourd'hui. Le rollback requiert une migration manuelle inverse (append).

**Idempotence `ADD COLUMN` (5432 dev vs 5433 déployé)** :
Le ledger `__migrations` empêche la double application. Si une migration a déjà son checksum
en base → skip. Si un fichier a été modifié après application (checksum différent) → throw.
Recommandation : utiliser `ADD COLUMN IF NOT EXISTS` dans les nouvelles migrations (PostgreSQL
9.6+) pour rendre les migrations robustes aux re-runs accidentels en dev.

### Q5. Sécurité / garanties d'état

Le ledger `__migrations` (nom + checksum SHA-256 + `applied_at`) garantit :
- Chaque migration s'applique exactement une fois (par nom de fichier).
- Un fichier modifié après application est détecté (checksum mismatch → throw).
- L'ordre d'application est celui du tri alphabétique des noms de fichiers → identique à
  l'ordre `when` du journal Drizzle (qui encode le même timestamp dans le nom).

RLS : le runner exécute le SQL complet du fichier, y compris les `ALTER TABLE … ENABLE ROW
LEVEL SECURITY` et `CREATE POLICY`. Résultat identique à `migrate()`.

La seule divergence possible par rapport à Drizzle : Drizzle a son propre ledger dans
`drizzle.__drizzle_migrations`. La bascule doit mapper l'existant (voir §4 Plan).

---

## 3. Évaluation Flyway

**Version actuelle** : 12.9.0 (18 juin 2026, Apache 2.0).
Source : [github.com/flyway/flyway — releases](https://github.com/flyway/flyway/releases/tag/flyway-12.9.0)

**Éditions** :
- **Community** (gratuit, open-source, Apache 2.0) : CLI + API + Desktop GUI. Couvre les
  migrations SQL versionnées, checksum + ledger (`flyway_schema_history`), parallel-safe.
- **Enterprise** (payant) : rollback, dry-run, analyse d'impact, support dédié, rapport HTML.
- (L'édition "Teams" a été fusionnée dans Enterprise.)

### Flyway résout-il le même problème ?

Oui. Flyway utilise des versions numériques ou horodatées (`V20260628151440__baseline.sql`).
Deux worktrees produisent deux fichiers aux noms différents → **zéro conflit de merge**
(même principe que Option D). Ledger `flyway_schema_history` natif avec checksum. Verrou
en base pendant la migration (safe en cluster).

### Coût d'intégration dans notre stack Node.js/Fastify

| Point | Analyse |
|---|---|
| **Dépendance JVM** | Flyway est 100% Java. CLI ≈ 130 MB téléchargement + JRE requis. Ajoute ~250 MB à l'image Docker. |
| **Boot in-process** | Notre provision s'exécute IN-PROCESS dans `server.ts` via `await provisionDatabase()`. Flyway est un outil externe — il faut l'invoquer en CLI (`child_process.exec`) ou via un init container Compose. Les deux cassent l'architecture actuelle. |
| **`pg_advisory_lock`** | Flyway a son propre mécanisme de lock (table ou advisory lock avec une clé différente). Il ne partage pas la clé 720916 de `withProvisionLock()`. Co-existence risquée si `task db:provision` + boot server tournent en parallèle. |
| **`task db:provision`** | Devrait invoquer `flyway migrate` au lieu de `tsx provision-cli.ts` → Java requis sur les machines dev. |
| **BDD e2e 5432** | Même exigence Java pour la BDD de test locale. |
| **Fail-closed** | Possible (Flyway throw en cas d'erreur), mais l'intégration `child_process` + gestion des codes de retour est plus fragile qu'un throw TypeScript. |
| **RLS** | Flyway exécute le SQL tel quel → RLS policies fonctionnent. ✅ |
| **Rollback** | Community : **NON**. Enterprise seulement (payant). |
| **Génération du squelette** | `drizzle-kit generate --custom` n'est plus applicable. Il faudrait créer les fichiers Flyway manuellement (`V<timestamp>__<nom>.sql`) ou utiliser un outil Flyway. `generate-tenant-rls.mjs` devrait être adapté. |

---

## 4. Tableau comparatif

| Critère | Statu quo (Drizzle) | Option D (runner maison ~40 lignes) | Flyway 12.9 Community |
|---|---|---|---|
| Collision `_journal.json` | ❌ Oui (problème réel) | ✅ Supprimée | ✅ Supprimée |
| Dépendance runtime | `drizzle-orm` (déjà là) | `pg` (déjà là) | Java 7+ (~250 MB) |
| Boot in-process | ✅ | ✅ | ❌ (externe) |
| `pg_advisory_lock` actuel | ✅ inchangé | ✅ inchangé | ⚠️ lock séparé à aligner |
| `task db:provision` | ✅ inchangé | ✅ inchangé | ❌ refactoring + Java |
| BDD test 5432 | ✅ | ✅ | ❌ Java sur dev |
| Fail-closed | ✅ (throw TypeScript) | ✅ (throw TypeScript) | ⚠️ (via child_process) |
| Ledger + checksum | ✅ `drizzle.__drizzle_migrations` | ✅ `__migrations` à créer | ✅ `flyway_schema_history` |
| RLS SQL custom | ✅ | ✅ | ✅ |
| Rollback | ❌ (Community) | ❌ | ❌ (Community) |
| Lignes de code delta | 0 | ~40 lignes | ~100 lignes (wrapper + Compose) |
| Auditabilité | Drizzle internals (boîte noire) | 40 lignes lisibles | CLI externe (boîte noire + JVM) |
| Scaffolding migrations | `drizzle-kit generate` | `drizzle-kit generate` (inchangé) | Remplacement ou adaptation |

---

## 5. Recommandation : **GO sur Option D**

Flyway est l'outil de référence pour les stacks JVM (Spring Boot, Quarkus). Pour un backend
Node.js/Fastify avec provision in-process, le coût JVM est disproportionné et l'intégration
casse l'architecture existante (boot-time, advisory lock, task db:provision, image Docker).

Option D (runner maison ~40 lignes) :
- Résout exactement le même problème (timestamp filenames → zero conflit).
- Zéro nouvelle dépendance (utilise `pg` déjà présent).
- Préserve toute l'architecture existante (advisory lock, fail-closed, task db:provision,
  generate-tenant-rls.mjs, drizzle-kit generate).
- Auditabilité maximale : 40 lignes de TypeScript vs une boîte noire JVM.

---

## 6. Plan d'implémentation (si GO validé)

### Fichier à modifier : `apps/api/shared/db/run-migrations.ts`

Remplacer le contenu par le runner maison. Aucun autre fichier ne change.

```typescript
import type { Pool } from "pg";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "drizzle";

export async function withProvisionLock<T>(pool: Pool, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [720916]);
    return await fn();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [720916]);
    client.release();
  }
}

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
    "select filename, checksum from __migrations"
  );
  const ledger = new Map(applied.rows.map((r) => [r.filename, r.checksum]));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const checksum = crypto.createHash("sha256").update(content).digest("hex");

    if (ledger.has(file)) {
      if (ledger.get(file) !== checksum) {
        throw new Error(`Migration ${file} checksum mismatch — ne jamais modifier une migration appliquée`);
      }
      continue;
    }

    await ownerPool.query("begin");
    try {
      await ownerPool.query(content);
      await ownerPool.query(
        "insert into __migrations (filename, checksum) values ($1, $2)",
        [file, checksum]
      );
      await ownerPool.query("commit");
    } catch (err) {
      await ownerPool.query("rollback");
      throw new Error(`Migration ${file} échouée : ${String(err)}`);
    }
  }
}
```

**Note sur `--> statement-breakpoint`** : le runner ci-dessus exécute chaque `.sql` dans
une seule transaction. PostgreSQL supporte le DDL transactionnel → safe. Les marqueurs
`--> statement-breakpoint` sont ignorés (ils sont présents dans le fichier mais ne
gênent pas `pool.query()`). Si une instruction DDL spécifique exige d'être hors transaction
(cas rare en PG), ajouter un commentaire `-- no-transaction` en tête du fichier et gérer
ce cas dans le runner.

### Bascule sans casser les BDD déjà provisionnées (5432 et 5433)

Le problème : les deux BDD ont déjà toutes les migrations appliquées via Drizzle
(`drizzle.__drizzle_migrations`), mais le nouveau runner ne le sait pas → il essaierait
de tout réappliquer → échec DDL (`CREATE TABLE already exists`, etc.).

**Plan de bascule** : le runner, avant d'appliquer des migrations, vérifie si
`drizzle.__drizzle_migrations` existe. Si oui (transition), il peuple `__migrations` depuis
Drizzle sans ré-exécuter le SQL :

```typescript
/* Bascule unique depuis Drizzle : peuple __migrations depuis drizzle.__drizzle_migrations */
const hasDrizzleSchema = await ownerPool.query(
  "select 1 from information_schema.schemata where schema_name = 'drizzle'"
);
if (hasDrizzleSchema.rowCount) {
  const drizzleMigrations = await ownerPool.query<{ hash: string; created_at: string }>(
    "select hash, created_at from drizzle.__drizzle_migrations"
  );
  for (const file of files) {
    if (ledger.has(file)) continue;
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const checksum = crypto.createHash("sha256").update(content).digest("hex");
    /* Si le checksum correspond à une migration Drizzle déjà appliquée → marquer sans réexécuter */
    const alreadyApplied = drizzleMigrations.rows.some((r) => r.hash === checksum);
    if (alreadyApplied) {
      await ownerPool.query(
        "insert into __migrations (filename, checksum) values ($1, $2) on conflict do nothing",
        [file, checksum]
      );
      ledger.set(file, checksum);
    }
  }
}
```

Ce bloc ne tourne qu'une fois par BDD (après la bascule, `drizzle.__drizzle_migrations`
est présent mais toutes les entrées sont dans `__migrations` → le bloc est inerte).

### Ordre de livraison

1. Implémenter et committer `run-migrations.ts` (runner + bascule).
2. Tester sur 5432 (dev) : `task db:provision` → doit peupler `__migrations` sans erreur.
3. Déployer sur 5433 (staging) via `./scripts/deploy-backend.sh` → même comportement.
4. Vérifier : `psql -c "select filename, applied_at from __migrations order by applied_at"`.
5. Mettre à jour `generate-tenant-rls.mjs` commentaire (ligne 96) pour supprimer la
   référence à `_journal.json` comme artefact runtime.

### Évolutions post-bascule

- **Génération** : `drizzle-kit generate` et `drizzle-kit generate --custom` sont inchangés.
  Les fichiers produits sont directement exploitables par le runner.
- **`_journal.json`** : reste dans git (artéfact drizzle-kit), ignoré au runtime. Aucun
  effort de nettoyage nécessaire.
- **Snapshots `meta/`** : inchangés, utilisés par drizzle-kit pour les diffs.
- **Collision résolue** : deux worktrees produisent `20260628HHMMSS_<nom>.sql` et
  `20260628HHMMSS_<autre>.sql` → noms différents → aucun conflit → merge trivial.

---

## 7. Corrections apportées à l'implémentation (vs le brouillon §6)

Le code §6 est un brouillon ; l'implémentation livrée corrige trois points découverts en
vérifiant contre un vrai PostgreSQL (tests `run-migrations.l2.test.ts`).

1. **Bascule par `folderMillis`, PAS par checksum.** Le brouillon (§ Bascule) marquait une
   migration comme appliquée si son checksum correspondait à un `hash` de
   `drizzle.__drizzle_migrations`. **Faux** : Drizzle décide d'appliquer une migration uniquement
   par `folderMillis` (le `when` du `_journal.json`), comparé au `max(created_at)` du ledger — le
   checksum/hash n'entre JAMAIS dans la décision (cf. `pg-core/dialect.migrate`). Sur 5432/5433,
   6 des 17 migrations ont été **éditées après application** → leur checksum diverge alors qu'elles
   sont bien appliquées. Une bascule par checksum les aurait crues « non appliquées » → ré-exécution
   du DDL → `… already exists` → boot fail-closed → crash-loop. La bascule livrée reproduit donc
   exactement le critère Drizzle : une migration dont le `when` (lu dans `_journal.json`) est
   `≤ max(created_at)` est inscrite au ledger sans ré-exécution ; les `when` supérieurs sont
   réellement en attente et appliqués normalement. → `_journal.json` est lu **uniquement pendant la
   bascule** (transition), pas au runtime courant.
2. **Transaction sur une connexion dédiée.** Le brouillon faisait `pool.query("begin")` /
   `pool.query(content)` / `pool.query("commit")` : `pool.query()` emprunte une connexion **par
   appel** → BEGIN, DDL et COMMIT pouvaient tomber sur des connexions différentes (DDL auto-commit
   hors transaction → atomicité illusoire). Livré : `pool.connect()` une fois par fichier, tout sur
   le même client.
3. **Échappatoire `-- no-transaction`.** Le runner enveloppe chaque fichier dans `BEGIN/COMMIT` ;
   or certains DDL PostgreSQL (`CREATE INDEX CONCURRENTLY`) sont interdits en bloc transactionnel.
   Une migration dont la 1ʳᵉ ligne est `-- no-transaction` est exécutée statement par statement
   (split sur `--> statement-breakpoint`) en auto-commit. Atomicité perdue dans ce mode → ses
   statements doivent être idempotents (`… IF NOT EXISTS`).

**Conséquence sur §6 « Ordre de livraison » point 5** : `_journal.json` n'est PAS un pur artéfact
dev — il reste nécessaire à la bascule. Ne pas le présenter comme « ignoré au runtime » ; il est lu
une fois lors de la transition Drizzle → runner. Le commentaire de `generate-tenant-rls.mjs` n'a
donc pas été modifié.

**Note dev 5432** : la BDD de dev peut être incohérente (migrations appliquées hors-bande par
d'autres agents, absentes du ledger Drizzle) — `drizzle-kit migrate` y échouerait **déjà** de la
même façon. Ce n'est pas une régression du runner. La cible critique est **5433** (provisionné
uniquement par le boot standard), où la bascule a été validée sur une BDD fraîche provisionnée par
le vrai `migrate()` Drizzle : 17 migrations inscrites, **zéro ré-exécution**, re-run idempotent.

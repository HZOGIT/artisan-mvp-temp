# OPE-880 — Éliminer la friction `drizzle/meta/_journal.json` en vague de migrations parallèles

> **Statut : SPIKE — recherche + reco + POC isolé. Aucune implémentation prod.**
> Reco soumise à validation humaine (cf. mémoire `awaiting-human-validation-gate`) avant toute mise en œuvre.
> Auteur : session `spike-journal-friction` (opus). Date : 2026-06-30.

## TL;DR

- **Cause unique de friction = le fichier *unique partagé* `drizzle/meta/_journal.json`.** Les `.sql` et les `*_snapshot.json` portent des **noms horodatés distincts** → ils ne se conflictent **jamais** en git. Seul le journal (tableau JSON partagé, append concurrent) collisionne.
- **Notre runtime ignore le journal** (runner Option D : apply par nom de fichier + ledger `__migrations`). Le journal ne sert plus QU'à `drizzle-kit generate` (calcul du diff). Il est donc **purement un artefact dev-time**, et son contenu est **100 % dérivable des noms de `.sql`**.
- **Preuve que le mal est déjà là** : le journal committé actuel a **42 entrées pour 44 `.sql`** — 2 migrations (`20260629120909_pieces-jointes`, `20260629164906_permissions-utilisateur-unique-constraint`) ont été **silencieusement droppées** du journal par un `generate` post-rebase. Le runtime n'a rien vu (il applique par nom) → corruption invisible, exactement le scénario de la mémoire `concurrent-migration-journal-corruption`.
- **Reco : (A) un git *merge driver* qui recanonicalise le journal + (D) un gate CI `verify` (journal 1:1 avec les `.sql`).** ~½ journée, totalement réversible (1 ligne `.gitattributes`), robuste à N workers parallèles. POC isolé fourni et **vérifié de bout en bout en git réel** (sans driver : `CONFLICT` ; avec : auto-résolu, idx uniques).

---

## 1. Le problème (rappel + preuve)

Vague ~24 migrations parallèles (29-30/06) → `_journal.json` a produit :
- ~40 commits de churn sur 7 jours (`git log --oneline --since=7d -- drizzle/meta/_journal.json` = 40) ;
- des **corruptions invisibles** : `idx` dupliqué auto-mergé **sans** marqueur de conflit git, entrées **droppées** par `drizzle-kit generate` post-rebase, plus quelques conflits francs.

Le SQL ne pose jamais problème. C'est **la concurrence d'écriture sur un fichier unique partagé**.

**État live au 2026-06-30** (mesuré par le POC, mode `verify`) :

```
.sql sans entrée journal: 20260629120909_pieces-jointes
.sql sans entrée journal: 20260629164906_permissions-utilisateur-unique-constraint
entries in journal: 42   |   .sql files: 44
```

→ Le journal committé est **déjà désynchronisé** de la réalité. Sans conséquence runtime (le runner applique les 44 `.sql` par nom), mais c'est la preuve que le mode de défaillance « dropped entries » est présent **maintenant**, silencieux.

## 2. Fait architectural clé — le runtime n'a pas besoin du journal

`apps/api/shared/db/run-migrations.ts` (runner Option D, déployé prod #228) :
- découvre les migrations par `readdirSync(...).filter(.sql).sort()` → **ordre = nom de fichier** ;
- décide l'application via le ledger maison `__migrations` (filename + sha256) ;
- **lit `_journal.json` uniquement** dans `backfillFromDrizzle()`, appelé **seulement** à la bascule one-shot (`transition && ledger.size === 0`, cf. `run-migrations.ts:248`) — déjà réalisée sur toutes les BDD déployées (5432/5433).

**Donc, en régime établi, `_journal.json` + snapshots sont du pur dev-time** pour `drizzle-kit generate`. Réf : `docs/architecture/migration-runner-option-d.md`.

`drizzle-kit generate` (docs officielles) : lit le **dernier snapshot** → diff avec le schéma TS → écrit `migration.sql` + `snapshot.json` + ajoute une entrée au `_journal.json`. Le journal sert à `generate` pour **repérer le dernier snapshot et l'ordre**.

Conséquence : le journal est **dérivable** — `tag = basename`, `when = epoch(préfixe timestamp)`, `idx = rang du tri par nom`. Seuls les snapshots portent un état irréductible (la base du diff), et ils **ne se conflictent pas** (noms horodatés uniques).

## 3. Réponses aux 5 questions du spike

### Q1 — Se passer totalement de `_journal.json`/snapshots committés ?
- **Snapshots : NON.** `generate` en a besoin comme base de diff ; sans eux, chaque `generate` régénère un baseline complet. (Ils ne sont pas le problème : noms distincts → zéro conflit. Juste du poids : ~42 fichiers, ~13 Mo.)
- **Journal : OUI, possible** (option B ci-dessous) : le `.gitignore`-er et le **régénérer depuis les `.sql`** avant chaque `generate`. Supprime totalement la surface de conflit (un fichier non suivi ne peut pas conflicter). Coût : change le contrat (journal hors VCS) + vérifier que `generate` fonctionne avec un journal reconstruit + snapshots committés.

### Q2 — Git *merge driver* pour rendre le journal merge-safe ? ✅ **OUI — recommandé**
Un driver custom (`.gitattributes` : `drizzle/meta/_journal.json merge=drizzle-journal`) recalcule le journal à chaque merge : **union des entrées des deux côtés → tri par nom → réindexation `idx = 0..n`**. Les collisions d'`idx` deviennent **structurellement impossibles** (idx = fonction pure de l'ensemble), les entrées droppées d'un côté sont **restaurées** par l'union, et les conflits francs disparaissent. Le `when` d'origine est préservé (on ne réindexe que `idx`). Prouvé en git réel (§6).

### Q3 — Mode no-journal / régén déterministe côté drizzle-kit ?
**Non, rien de natif.** Pas de mode « sans journal ». `--ignore-conflicts` ne fait que sauter les checks de commutativité (et la doc déconseille). L'issue communautaire de référence (#2488 « Merge conflicting migrations ») est **toujours ouverte** — aucun support natif de merge. Les pratiques 2025/2026 (discussion #1104) se résument à : (a) régénérer sur le parent, (b) un script tiers qui garde « theirs » + régénère, (c) merge queue + génération en CI. Aucune n'est plus simple que notre Q2 vu que **notre runtime ignore déjà le journal**.

### Q4 — Wrapper qui rebase le journal sur `origin/staging` avant d'ajouter l'entrée ?
**Viable, c'est l'approche « regenerate-on-parent » plébiscitée par la communauté** (discussion #1104, réponse la plus récente, avril 2026) :
```
git fetch origin staging && git checkout origin/staging -- drizzle/meta/ && drizzle-kit generate --custom --name=<nom>
```
→ `idx = max+1` déterministe, dernier snapshot = celui d'`origin`. **Robuste mais** : exige réseau + état worktree propre **au moment du generate**, et **sérialise** de fait (chaque worker se rebase sur le dernier). C'est l'extension de la mitigation actuelle du PM (`pm-serialize-migration-dispatch`). Complémentaire de Q2, pas exclusif — mais ne couvre PAS un merge a posteriori de deux PRs déjà ouvertes (Q2 si).

### Q5 — Comparatif (voir §4).

## 4. Comparatif chiffré

| Option | Robustesse multi-agents | Effort | Réversibilité | Couvre les 3 modes (conflit franc / idx dup silencieux / entrée droppée) |
|---|---|---|---|---|
| **A. Merge driver** (Q2) | ★★★★★ déterministe à N workers, agit à chaque merge | **~3 h** : 1 script (~50 l) + 1 ligne `.gitattributes` + enregistrement driver (postinstall) | ★★★★★ retirer 1 ligne | **Oui / Oui / Oui** (union+réindex) |
| **D. Gate CI `verify`** (backstop) | ★★★★☆ bloque le merge si journal ≠ `.sql` | **~1 h** : ajouter `verify` au gate reviewer | ★★★★★ | détecte (ne corrige pas) — aurait stoppé les 2 entrées droppées actuelles |
| B. Journal hors VCS + rebuild | ★★★★★ surface de conflit = 0 | ~4 h + vérif `generate` | ★★★★☆ ré-committer le journal | **Oui / Oui / Oui** (le fichier n'existe plus en VCS) |
| C. Wrapper regenerate-on-parent (Q4) | ★★★☆☆ sérialise, exige réseau/worktree propre | ~3 h | ★★★★☆ | Oui à la génération ; **non** pour 2 PRs déjà ouvertes |
| Statu quo (sérialiser dispatch, PM) | ★★☆☆☆ humain dans la boucle, tue le parallélisme | 0 | n/a | mitige, ne corrige pas |

## 5. Recommandation

**Adopter A (merge driver) + D (gate `verify`).**
- **A** supprime la corruption **au moment du merge**, sans changer le workflow dev (on continue de committer le journal ; git le merge proprement). Réversible par suppression d'une ligne.
- **D** est le filet : il aurait bloqué les **2 entrées droppées présentes aujourd'hui**. À brancher dans le gate du reviewer (`pnpm check`/lint déjà là).
- **B** en *follow-up optionnel* si on veut tuer le churn de commits du journal (le sortir du VCS) — plus radical, à valider après A.
- **C** reste utile comme discipline de génération (rebase sur `origin/staging` avant `generate`) et recoupe `pm-serialize-migration-dispatch` ; pas un prérequis.

**Plan d'implémentation (NON exécuté — attente validation humaine) :**
1. Committer `scripts/drizzle/canonicalize-journal.mjs` (le POC §6, durci).
2. `.gitattributes` : `drizzle/meta/_journal.json merge=drizzle-journal`.
3. Enregistrer le driver par clone (non versionné dans `.git/config`) via un script `prepare`/postinstall (et dans `launch-claude-bg.sh` pour les worktrees) :
   `git config merge.drizzle-journal.driver "node scripts/drizzle/canonicalize-journal.mjs merge %O %A %B"`.
4. Corriger l'état actuel : `node scripts/drizzle/canonicalize-journal.mjs rebuild drizzle` (réintègre les 2 entrées manquantes) — **migration de données nulle**, le runtime est déjà correct.
5. Ajouter au gate reviewer : `node scripts/drizzle/canonicalize-journal.mjs verify drizzle` (bloque le merge si journal ≠ `.sql`).

**Risques / limites :**
- Le driver doit être **enregistré dans chaque clone/worktree** (`.git/config` non versionné) → l'étape 3 (postinstall + launch script) est obligatoire, sinon git retombe sur le merge texte. Le gate `verify` (D) couvre ce trou.
- Le merge driver agit sur `merge`/`rebase` ; il ne s'exécute pas si un worker écrase le journal hors-merge (push direct concurrent). Le gate `verify` reste le backstop.
- `rebuild` réinvente `when` depuis le timestamp (perte des millis d'origine) ; **sans impact** (runtime ignore `when` post-bascule). Le mode `merge` préserve le `when` existant.

## 6. POC isolé (vérifié)

> Vit en spike (non câblé). Embarqué ici pour traçabilité. Checks : self-check des 3 modes de corruption + intégration git réelle.

### `canonicalize-journal.mjs`

```js
import fs from "node:fs";
import path from "node:path";

const VERSION = "7";

function parseWhen(tag) {
  const m = tag.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) throw new Error(`tag sans préfixe timestamp: ${tag}`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

/** Recalcule un journal canonique depuis un ensemble d'entrées (idx = rang du tri par tag). */
function canonicalize(entries) {
  const byTag = new Map();
  for (const e of entries) byTag.set(e.tag, e);
  const sorted = [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
  return {
    version: VERSION,
    dialect: "postgresql",
    entries: sorted.map((e, idx) => ({
      idx,
      version: e.version ?? VERSION,
      when: e.when ?? parseWhen(e.tag),
      tag: e.tag,
      breakpoints: e.breakpoints ?? true,
    })),
  };
}

function readJournal(file) {
  const raw = fs.readFileSync(file, "utf8");
  if (/^<{7}|^={7}|^>{7}/m.test(raw)) {
    throw new Error(`${file} contient des marqueurs de conflit git non résolus`);
  }
  return JSON.parse(raw).entries ?? [];
}

function entriesFromSqlDir(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ tag: f.replace(/\.sql$/, ""), when: parseWhen(f.replace(/\.sql$/, "")) }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
const [mode, a, b, c] = isMain ? process.argv.slice(2) : [];

if (!isMain) {
  /* importé pour test → on n'exécute pas le CLI */
} else if (mode === "merge") {
  /* git appelle: driver %O(=a, ancêtre, ignoré) %A(=b, nôtre/résultat) %B(=c, leur) */
  const merged = canonicalize([...readJournal(b), ...readJournal(c)]);
  fs.writeFileSync(b, `${JSON.stringify(merged, null, 2)}\n`);
} else if (mode === "rebuild") {
  const dir = a;
  const journal = canonicalize(entriesFromSqlDir(dir));
  fs.writeFileSync(path.join(dir, "meta", "_journal.json"), `${JSON.stringify(journal, null, 2)}\n`);
} else if (mode === "verify") {
  const dir = a;
  const sqlTags = new Set(entriesFromSqlDir(dir).map((e) => e.tag));
  const jrn = readJournal(path.join(dir, "meta", "_journal.json"));
  const jrnTags = new Set(jrn.map((e) => e.tag));
  const idxs = jrn.map((e) => e.idx);
  const errs = [];
  for (const t of sqlTags) if (!jrnTags.has(t)) errs.push(`.sql sans entrée journal: ${t}`);
  for (const t of jrnTags) if (!sqlTags.has(t)) errs.push(`entrée journal sans .sql: ${t}`);
  if (new Set(idxs).size !== idxs.length) errs.push(`idx dupliqué: ${idxs.join(",")}`);
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  console.log(`OK — ${jrnTags.size} migrations, journal 1:1 avec .sql, idx uniques`);
} else {
  console.error("usage: canonicalize-journal.mjs merge <O> <A> <B> | rebuild <dir> | verify <dir>");
  process.exit(2);
}

export { canonicalize, parseWhen };
```

### Résultats des checks

**Self-check (3 modes de corruption)** — `node selfcheck.mjs` :
```
selfcheck OK — collisions idx impossibles, entrées droppées restaurées, idempotent
```
(assertions : union de deux branches concurrentes → idx `[0,1,2]` uniques ; entrée droppée côté stale restaurée par l'union ; `canonicalize` idempotent ; `parseWhen` déterministe.)

**Intégration git réelle** — deux branches ajoutent chacune une migration `idx=1` :
```
=== SANS driver (git standard) ===
CONFLICT (content): Merge conflict in drizzle/meta/_journal.json
Automatic merge failed; fix conflicts and then commit the result.

=== AVEC driver ===
--- resulting journal ---
entries: 3
idx=0 20260628151440_baseline
idx=1 20260629213129_rls-child
idx=2 20260629215000_devis-options
idx uniques: OK
git status (clean = auto-résolu): <vide>
```

**Verify sur le tree live** : détecte les 2 entrées droppées actuelles (§1) — le gate D aurait bloqué leur merge.

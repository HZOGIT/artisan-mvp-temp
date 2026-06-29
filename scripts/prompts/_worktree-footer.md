---

## WORKTREE ISOLE — REGLES ABSOLUES (lire avant toute action)

Tu travailles dans un **worktree Git dédié, séparé du repo principal**.

| | Valeur |
|---|---|
| **Ton répertoire de travail** | `/tmp/wt-__SESSION_NAME__` |
| **Ta branche** | `feat/__SESSION_NAME__` |
| **Repo principal — NE PAS TOUCHER** | `__MAIN_REPO__` |

### REGLE 1 — tout se passe dans le worktree (édition ET pnpm)

Ton worktree est **autonome** : il a ses propres `node_modules` (installés au lancement). Tous tes
fichiers (`Edit`, `Write`, `Read`, `git add`, `git commit`) **ET toutes tes commandes**
(`pnpm exec …`, `drizzle-kit`, `tsc`, `vite`, `gh`) se lancent **depuis `/tmp/wt-__SESSION_NAME__`**.

Tu ne touches **JAMAIS** `__MAIN_REPO__` — ni pour éditer, ni pour lancer `pnpm`. Lancer `pnpm` depuis
le repo principal écrirait tes migrations/artefacts **dans le mauvais repo** et lirait un schéma périmé.

Chemin correct pour tout fichier :
```
/tmp/wt-__SESSION_NAME__/apps/api/...
/tmp/wt-__SESSION_NAME__/apps/web/...
/tmp/wt-__SESSION_NAME__/drizzle/...
```

### REGLE 2 — vérifier ton environnement en premier

Avant de lire le plan Linear ou de modifier quoi que ce soit, lance :

```bash
git -C /tmp/wt-__SESSION_NAME__ branch --show-current
```

Résultat attendu : `feat/__SESSION_NAME__`. Si ce n'est pas le cas, arrête et signale le problème.

### REGLE 3 — tous les git via chemin absolu du worktree

```bash
git -C /tmp/wt-__SESSION_NAME__ add apps/api/modules/...   # chemin relatif au worktree
git -C /tmp/wt-__SESSION_NAME__ status                     # vérifier avant commit
git -C /tmp/wt-__SESSION_NAME__ commit -m "fix(<module>): ... (OPE-XXX)"
git -C /tmp/wt-__SESSION_NAME__ push origin feat/__SESSION_NAME__
```

Jamais `git add -A`, jamais `git add .`, jamais `git commit -a`. Jamais `git reset --hard`. `push --force` interdit **sauf** `--force-with-lease` sur ta propre branche `feat/<session>` (rebase préventif ci-dessous) — jamais sur une branche partagée.

### Préchauffer le cache TypeScript (background, dès le début)

```bash
cd /tmp/wt-__SESSION_NAME__ && pnpm check:parallel &
```

Le pre-commit hook utilise `check:parallel` (incremental). Sans ce warm-up, le premier commit compile tout from scratch (~2 min).

### Base de test du worktree — déjà provisionnée

Au lancement, une base PostgreSQL dédiée a été créée et provisionnée depuis le `drizzle/` de ton worktree.
Le nom et l'URL sont dans `.env.test.local` :

```bash
cat /tmp/wt-__SESSION_NAME__/.env.test.local   # DATABASE_URL + TEST_DB_NAME
```

Pour les tests L2/L3 (vitest), passe cette URL :

```bash
cd /tmp/wt-__SESSION_NAME__
DATABASE_URL="$(grep ^DATABASE_URL= .env.test.local | cut -d= -f2-)" \
  node_modules/.bin/vitest run -c vitest.api.config.ts --no-file-parallelism <fichiers>
```

Si tu **ajoutes une migration** en cours de session, provisionne-la manuellement sur ta base de test :

```bash
cd /tmp/wt-__SESSION_NAME__ && \
  DATABASE_URL="$(grep ^DATABASE_URL= .env.test.local | cut -d= -f2-)" \
  APP_DATABASE_URL="$(grep ^APP_DATABASE_URL= .env.test.local | cut -d= -f2-)" \
  pnpm exec tsx apps/api/shared/db/provision-cli.ts
```

**Pas de `task db:provision`** — cette tâche cible la base partagée `artisan_mvp` (5432), pas ta base isolée.

### REGLE 4 — migrations Drizzle : GÉNÉRER DEPUIS LE WORKTREE

**Génère toujours depuis ton worktree**, jamais depuis le repo principal :
```bash
cd /tmp/wt-__SESSION_NAME__ && \
  DATABASE_URL="$(grep ^DATABASE_URL= .env.test.local | cut -d= -f2-)" \
  pnpm exec drizzle-kit generate --name=<nom>
```
Ainsi drizzle-kit lit **ton** schéma (tes edits) et écrit dans **ton** `drizzle/`. Lancé depuis
`__MAIN_REPO__`, il lirait le schéma périmé du repo principal et y écrirait la migration → contenu faux + fichier orphelin dans le mauvais repo.

**Vérifie après generate** :
```bash
git -C /tmp/wt-__SESSION_NAME__ status -- drizzle/        # tes .sql/snapshot/_journal sont ICI
git -C __MAIN_REPO__ status -- drizzle/                   # DOIT être vide (rien dans le repo principal)
```

🔴 **La migration générée est un BROUILLON — relis-la et complète-la.** `drizzle-kit generate` ne voit que
le schéma TS : il **oublie systématiquement la RLS** et la plupart des index/CHECK. Avant de committer, relis
le `.sql` ligne par ligne et applique nos conventions manquantes : **RLS** (nouvelle table à `artisanId`/`artisan_id`
→ `node scripts/rls/generate-tenant-rls.mjs` ; accès public par token → policy public-token), **index** (FK, colonnes
filtrées/triées, partiels), **CHECK** (statuts, invariants), **FK `ON DELETE`**, **sûreté sur données existantes**
(`NOT VALID`/backfill). Détail + checklist : **skill `migrations` §2/§3**. Une migration générée non complétée sera **rejetée** par le reviewer.

**Collision de migrations résolue par Option D** (cf. `docs/architecture/migration-runner-option-d.md` §7) :
les noms de fichiers sont **horodatés** (`YYYYMMDDHHMMSS_<nom>.sql`) → uniques par construction → **pas de
rebase ni de régénération nécessaire pour l'ordre**. Si `_journal.json` présente un conflit textuel au merge,
résolution triviale : garder les deux entrées (un entrée par migration) → `_journal.json` est cosmétique au
runtime, le runner applique les migrations **par nom de fichier**.

### Vérifier avant la PR

```bash
cd /tmp/wt-__SESSION_NAME__ && pnpm check
```

Si `pnpm check` échoue, corriger avant de continuer.

### Rebase préventif avant la PR

Avant d'ouvrir la PR (ou avant de pousser les corrections d'un round de review), rebase sur `origin/staging` pour éviter les faux-reverts et réduire les risques de conflit sémantique au merge :

```bash
git -C /tmp/wt-__SESSION_NAME__ fetch origin staging
git -C /tmp/wt-__SESSION_NAME__ rebase origin/staging
git -C /tmp/wt-__SESSION_NAME__ push --force-with-lease origin feat/__SESSION_NAME__
```

`--force-with-lease` est autorisé ici : tu es le seul à pousser sur ta propre branche `feat/<session>`. Interdit sur `staging` ou toute branche partagée.

### Créer la Pull Request

```bash
cd /tmp/wt-__SESSION_NAME__ && gh pr create \
  --base staging \
  --head feat/__SESSION_NAME__ \
  --title "<titre court — max 70 car.>" \
  --body "$(cat <<'EOF'
## Résumé
- <bullet 1>
- <bullet 2>

## Tests
- [ ] pnpm check
- [ ] pnpm lint
- [ ] Test navigateur / e2e si applicable

Session : __SESSION_NAME__
EOF
)"
```

### Notifier le reviewer

```bash
/tmp/wt-__SESSION_NAME__/scripts/agents/notify.sh reviewer PR_READY \
  "PR prête — __SESSION_NAME__ — $(cd /tmp/wt-__SESSION_NAME__ && gh pr view feat/__SESSION_NAME__ --json url -q .url)"
```

### Corrections reviewer (REVIEW_FEEDBACK)

```bash
/tmp/wt-__SESSION_NAME__/scripts/agents/listen.sh __SESSION_NAME__ --drain
```

Applique les corrections **dans le worktree** (`/tmp/wt-__SESSION_NAME__/...`), pousse, puis :

```bash
/tmp/wt-__SESSION_NAME__/scripts/agents/notify.sh reviewer PR_READY \
  "Corrections appliquées — __SESSION_NAME__ — $(cd /tmp/wt-__SESSION_NAME__ && gh pr view feat/__SESSION_NAME__ --json url -q .url)"
```

### Démons longue-durée — INTERDITS depuis un worktree

**Ne jamais démarrer un processus longue-durée (screen, boucle cron, watcher) depuis `/tmp/wt-*`.**
Le worktree est supprimé au merge → le daemon hérite d'un `cwd` mort et tous ses chemins relatifs
(`$HERE/script.sh`) cassent silencieusement. Lancer depuis le **repo persistant** (`/home/developer/artisan-mvp-temp`).

### Fin

Une fois mergé par le reviewer, ta mission est terminée. Le reviewer gère le cleanup du worktree et le déploiement.

---

## WORKTREE ISOLE — REGLES ABSOLUES (lire avant toute action)

Tu travailles dans un **worktree Git dédié, séparé du repo principal**.

| | Valeur |
|---|---|
| **Ton répertoire de travail** | `/tmp/wt-__SESSION_NAME__` |
| **Ta branche** | `feat/__SESSION_NAME__` |
| **Repo principal (pnpm UNIQUEMENT)** | `__MAIN_REPO__` |

### REGLE 1 — jamais editer dans le repo principal

Tous tes fichiers (`Edit`, `Write`, `Read`, `git add`, `git commit`) **sont dans `/tmp/wt-__SESSION_NAME__`**.

Le repo `__MAIN_REPO__` sert **uniquement** à lancer `pnpm` (node_modules y vivent). Tu n'y modifies rien, tu n'y commites rien.

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

Jamais `git add -A`, jamais `git add .`, jamais `git commit -a`. Jamais `git reset --hard`, jamais `push --force`.

### Préchauffer le cache TypeScript (background, dès le début)

```bash
cd __MAIN_REPO__ && pnpm check:parallel &
```

Le pre-commit hook utilise `check:parallel` (incremental). Sans ce warm-up, le premier commit compile tout from scratch (~2 min).

### REGLE 4 — migrations Drizzle : nettoyer avant generate

**Si ta tâche nécessite une migration**, vérifie d'abord que ton worktree ne contient PAS de fichiers `.sql` parasites (d'une autre branche) :

```bash
# Fichiers sql trackés sur origin/staging :
git -C /tmp/wt-__SESSION_NAME__ diff origin/staging --name-only -- drizzle/pg/

# Fichiers sql non commités dans le worktree :
git -C /tmp/wt-__SESSION_NAME__ status --short drizzle/pg/
```

Si des `.sql` apparaissent qui n'appartiennent PAS à ta feature → les supprimer AVANT `drizzle-kit generate` :
```bash
# Exemple : supprimer un fichier étranger
rm /tmp/wt-__SESSION_NAME__/drizzle/pg/0059_fichier-etranger.sql
```

Puis générer et vérifier que **seuls TES fichiers** apparaissent dans `git diff origin/staging -- drizzle/pg/`.

**Ne jamais commiter de migrations d'une autre branche.** Le reviewer rejettera tout journal incohérent.

### Vérifier avant la PR

```bash
cd __MAIN_REPO__ && pnpm check
```

Si `pnpm check` échoue, corriger avant de continuer.

### Créer la Pull Request

```bash
cd __MAIN_REPO__ && gh pr create \
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
__MAIN_REPO__/scripts/agents/notify.sh reviewer PR_READY \
  "PR prête — __SESSION_NAME__ — $(cd __MAIN_REPO__ && gh pr view feat/__SESSION_NAME__ --json url -q .url)"
```

### Corrections reviewer (REVIEW_FEEDBACK)

```bash
__MAIN_REPO__/scripts/agents/listen.sh __SESSION_NAME__ --drain
```

Applique les corrections **dans le worktree** (`/tmp/wt-__SESSION_NAME__/...`), pousse, puis :

```bash
__MAIN_REPO__/scripts/agents/notify.sh reviewer PR_READY \
  "Corrections appliquées — __SESSION_NAME__ — $(cd __MAIN_REPO__ && gh pr view feat/__SESSION_NAME__ --json url -q .url)"
```

### Fin

Une fois mergé par le reviewer, ta mission est terminée. Le reviewer gère le cleanup du worktree et le déploiement.

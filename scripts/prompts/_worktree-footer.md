---

## Protocole worktree — obligatoire à la fin de ta mission

Tu travailles dans un **worktree Git isolé** :
- Répertoire courant : `/tmp/wt-__SESSION_NAME__`
- Branche : `__BRANCH__`
- Repo principal : `__MAIN_REPO__`

Les scripts utilitaires sont dans `__MAIN_REPO__/scripts/` — utilise leurs **chemins absolus** depuis ce worktree.

### 0. Préchauffer le cache TypeScript (dès le début)

Lance immédiatement en background pour que le cache `.tsbuildinfo` soit chaud au moment du premier commit :

```bash
cd __MAIN_REPO__ && pnpm check:parallel &
```

Le pre-commit hook utilise `check:parallel` (incremental). Sans ce warm-up, le premier commit est lent (~2 min) car il compile tout from scratch.

### 1. Commits chirurgicaux (dans ce worktree)

```bash
git add <fichiers explicites — jamais git add -A ni git add .>
git commit -m "feat/fix(<module>): <description> (OPE-XXX)"
git push origin __BRANCH__
```

Règles : `//` interdit dans le TypeScript, pas de `git reset --hard` ni `push --force`.

### 2. Vérifier avant de créer la PR

```bash
# Depuis __MAIN_REPO__ (pnpm check est global) :
cd __MAIN_REPO__ && pnpm check
```

Si `pnpm check` échoue → corriger avant de continuer.

### 3. Créer la Pull Request

```bash
gh pr create \
  --base staging \
  --head __BRANCH__ \
  --title "<titre court — max 70 car.>" \
  --body "$(cat <<'EOF'
## Résumé
- <bullet 1>
- <bullet 2>

## Tests
- [ ] pnpm check ✅
- [ ] pnpm lint ✅
- [ ] Test navigateur / e2e si applicable

🤖 Session : __SESSION_NAME__
EOF
)"
```

Note l'URL de la PR retournée par `gh pr create`.

### 4. Notifier le reviewer

```bash
__MAIN_REPO__/scripts/agents/notify.sh reviewer PR_READY \
  "PR prête pour review — session : __SESSION_NAME__ — $(gh pr view __BRANCH__ --json url -q .url)"
```

### 5. Attendre les éventuels retours

La session reviewer peut t'envoyer un message `REVIEW_FEEDBACK` si des corrections sont demandées.
Quand tu le reçois, lis ta boîte :

```bash
__MAIN_REPO__/scripts/agents/listen.sh __SESSION_NAME__ --drain
```

Applique les corrections, pousse, puis renvoie une notification :

```bash
__MAIN_REPO__/scripts/agents/notify.sh reviewer PR_READY \
  "Corrections appliquées — __SESSION_NAME__ — $(gh pr view __BRANCH__ --json url -q .url)"
```

### 6. Fin

Une fois le reviewer ayant mergé, ta mission est terminée. Le reviewer gère le cleanup du worktree et le déploiement.

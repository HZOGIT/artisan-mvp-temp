# Session nettoyage de la codebase — Garder une codebase propre

Linear projet : https://linear.app/operioz/project/garder-une-codebase-propre-a0d35a18779c

## Mission

Nettoyer la codebase de façon chirurgicale et sûre. Chaque action doit être
un commit isolé (git add <chemins explicites>, jamais git add -A).

## Règles de sécurité

- **Commit chirurgical uniquement** : `git add <fichiers explicites>` — jamais `git add -A` / `git add .`
- Ne toucher qu'à ce qui est listé ci-dessous ; laisser intact tout le reste
- Vérifier TypeScript (`npx tsc --noEmit`) avant chaque commit impliquant du code
- Pas de `git push --force`
- Branch = `staging` (branche partagée multi-agents)

## Backlog de nettoyage (par priorité)

### 1. `check_db_schema.js` à la racine

Fichier `./check_db_schema.js` à la racine du repo. Lire son contenu, déterminer
s'il est encore utile (probablement un script jetable de l'époque MySQL → PG).
Si obsolète → supprimer + commit.

### 2. `docs/` — rapports et docs stales

Les fichiers suivants semblent être des rapports one-shot ou de la documentation morte :
```
docs/todo.md
docs/TEST_ENDPOINTS.md
docs/RAPPORT_TEST_FINAL.md
docs/RAPPORT_FINAL.md
docs/STABILISATION_RULES.md
docs/RAPPORT_SECURITE_FINAL.md
docs/HANDOVER.md
docs/CLERK_INTEGRATION_NOTES.md
```

Pour chaque fichier :
1. Lire rapidement le contenu
2. Évaluer si l'info est encore utile ou si elle a été absorbée ailleurs
3. Archiver ou supprimer les docs mortes (git rm)
4. Conserver tout ce qui est encore référencé ou actif

Un seul commit pour toute la purge docs.

### 3. `console.log` non intentionnels hors tests

```bash
grep -rn "console\.log\|console\.warn\|console\.error" apps/ packages/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "node_modules\|\.test\.\|\.spec\." \
  | grep -v "logger\|Logger"
```

Pour chaque occurrence :
- Si c'est du debug temporaire → supprimer
- Si c'est intentionnel (ex: script CLI, logger wrapper) → laisser ou convertir en `logger.*`
- Commit séparé par module si plusieurs fichiers affectés

### 4. Commentaires "what" redondants dans `apps/api/`

Scanner `apps/api/` pour repérer des commentaires qui décrivent ce que le code fait
déjà (ex: `// Retourne le devis`, `// Vérifie l'existence`, `// Ouvre la connexion`).
Les supprimer si redondants. Garder les commentaires "why" (invariants, workarounds,
contraintes légales).

```bash
grep -rn "^// [A-Z]\|^  // [A-Z]\|^    // [A-Z]" apps/api/ \
  --include="*.ts" | grep -v test | head -50
```

Parcourir fichier par fichier, éditer chirurgicalement.
Un commit par module (ex: `chore(devis): supprime commentaires what redondants`).

### 5. `drizzle.config.ts` — nettoyage du commentaire OPE-184

```bash
grep -n "OPE-" drizzle.config.ts
```

Le commentaire référence `OPE-184` (migration MySQL→PG terminée). Vérifier si
la migration est complète, auquel cas simplifier le fichier (supprimer la logique
de dual-dialect si MySQL est mort) et retirer la référence OPE.

### 6. Vérifier les fichiers de scripts à la racine de `scripts/`

```bash
ls scripts/
```

Repérer les scripts jetables ou mal nommés. Supprimer ceux qui sont clairement
obsolètes (ex: scripts liés à MySQL, à une époque révolue). Garder les scripts
actifs (deploy, e2e, pw-run, etc.).

## Format des commits

```
chore(scope): description courte du nettoyage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Exemples :
- `chore(root): supprime check_db_schema.js (script jetable MySQL)`
- `chore(docs): archive les rapports stales pre-refonte`
- `chore(api): supprime console.log de debug dans modules/clients`

## Push

Pousser sur `staging` après chaque lot cohérent.
Vérifier après le push que les commits sont bien dans `origin/staging`.

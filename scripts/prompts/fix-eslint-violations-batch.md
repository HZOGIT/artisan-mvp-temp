Tu es l'agent **fix-eslint-violations** sur le projet Operioz (branche `staging`).

## Objectif

Corriger, en un seul batch, les violations ESLint **`no-explicit-any`** et **`no-non-null-assertion`** dans les fichiers `apps/api/` et `apps/web/src/`, fichier par fichier, avec soin.

Ce cron tourne toutes les 10 min. À chaque run tu corriges un batch de **5 fichiers** puis tu t'arrêtes. Si aucune violation ne reste, tu notifies et tu t'arrêtes.

---

## Détection du prochain batch

```bash
pnpm lint:api 2>&1 | grep -E " error .*(no-explicit-any|no-non-null-assertion)" | grep -oP "(?<=artisan-mvp-temp/)apps/[^:]*" | sort -u | head -5
pnpm lint:web 2>&1 | grep -E " error .*(no-explicit-any|no-non-null-assertion)" | grep -oP "(?<=artisan-mvp-temp/)apps/[^:]*" | sort -u | head -5
```

Si les deux commandes ne retournent rien → 0 violations restantes → notifier et s'arrêter :
```bash
./scripts/agents/ntfy-pub.sh "fix-eslint-violations" "✅ Toutes les violations no-explicit-any + no-non-null-assertion corrigées" "Le cron peut être désactivé."
```

---

## Règles de correction

### `no-explicit-any`

Remplacer chaque `any` par le **type exact** selon le contexte :
- Paramètre de fonction : lire ce que le code fait avec → typer précisément
- Retour de fonction : inférer depuis les branches de retour
- Variable temporaire : `unknown` si vraiment inconnu + guard de type
- Cast `as any` → essayer de supprimer, ou remplacer par `as unknown as TargetType` si vraiment nécessaire
- `Record<string, any>` → `Record<string, unknown>` sauf si les valeurs sont typées

**Ne jamais** remplacer `any` par `unknown` sans réfléchir au contexte. Prefer un type précis.

### `no-non-null-assertion`

Remplacer chaque `obj!.prop` par :
- `if (!obj) throw new Error(...)` + `obj.prop` si l'absence est une erreur
- `obj?.prop` si l'absence est tolérée (retourne `undefined`)
- `obj ?? defaultValue` si une valeur de fallback existe
- Guard explicite : `const v = obj; if (!v) return; v.prop`

**Ne jamais** supprimer le `!` sans gérer le cas null/undefined.

---

## Procédure par batch

1. Trouver les 5 premiers fichiers avec violations (API en priorité, puis web)
2. Pour chaque fichier :
   a. Lire le fichier entier
   b. Comprendre le contexte de chaque violation
   c. Corriger avec le type ou le guard approprié
   d. Ne pas modifier de lignes hors violations
3. `pnpm check` — si erreurs TypeScript liées aux corrections → ajuster
4. `pnpm lint:api && pnpm lint:web` — vérifier que les violations des fichiers modifiés disparaissent
5. Commit chirurgical — lister **explicitement** les fichiers :
   ```bash
   git add apps/api/modules/foo/bar.ts apps/web/src/features/baz.tsx
   git commit -m "fix(eslint): no-explicit-any + no-non-null-assertion — batch $(date +%Y%m%d-%H%M)"
   git push origin staging
   ```
6. Notifier :
   ```bash
   ./scripts/agents/ntfy-pub.sh "fix-eslint-violations" "🔧 Batch ESLint terminé" "Fichiers corrigés : <liste>"
   ```

---

## Règles absolues

- `//` INTERDIT dans les fichiers `.ts` et `.tsx` sous `apps/`. Utiliser `/** */` ou `/* */`.
- `git add` uniquement les fichiers corrigés, nommés explicitement
- Ne jamais toucher aux fichiers ESLint de config (`eslint.*.config.mjs`, `eslint/*.mjs`)
- Ne jamais corriger les violations en `warn` (uniquement celles en `error`)
- Si une correction n'est pas évidente après lecture du contexte → **sauter ce fichier** et passer au suivant

---

Commence maintenant.

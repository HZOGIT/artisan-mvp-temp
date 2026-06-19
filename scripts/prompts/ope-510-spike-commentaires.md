# OPE-510 — Spike : convention de commentaires dans la codebase

Linear : https://linear.app/operioz/issue/OPE-510

## Mission

Conduire un spike d'analyse (read-only, pas de code à livrer) pour définir
la convention de commentaires à adopter dans la codebase Operioz.

Livrable : commentaire structuré posté sur OPE-510 via MCP Linear + issue enfant créée.
Durée max : 1h30.

## Contexte

Rappels sur la philosophie cible (déjà en vigueur dans les instructions Claude) :
- Pas de commentaires "what" — les noms suffisent
- Un commentaire seulement si le WHY est non-obvious (invariant caché, workaround, contrainte légale)
- Pas de multi-lignes sauf JSDoc
- Pas de références OPE-XXX dans le code source

Mais la codebase existante mélange les styles et il n'y a pas de règle ESLint enforçant cela.

## Étapes

### 1. Audit de l'existant

```bash
# Volume de commentaires par zone
grep -rn "^// \|^  // \|^    // " src/ --include="*.ts" | wc -l
grep -rn "/\*\*\|/\*[^*]" src/ --include="*.ts" | wc -l
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" | head -20
grep -rn "OPE-[0-9]" src/ --include="*.ts" | head -20

# Exemples de commentaires "what" redondants
grep -rn "^// [A-Z]" src/modules/ --include="*.ts" | head -30

# Fichiers les plus verbeux
grep -rn "^// " src/ --include="*.ts" -l | xargs -I{} sh -c 'echo "$(grep -c "^// " {} 2>/dev/null) {}"' | sort -rn | head -20
```

Lire 5-10 fichiers représentatifs de patterns différents pour avoir des exemples concrets.

### 2. Benchmark

Comparer les deux approches sur nos cas réels :
- **"No comment by default"** (WHY only)
- **"Module-level doc"** (un header de fichier + JSDoc sur les interfaces publiques)

Pour chaque : risque de drift, cohérence avec le style actuel, outillage ESLint disponible.

Règles ESLint pertinentes à évaluer :
- `no-warning-comments` (interdit TODO/FIXME non résolus)
- `spaced-comment` (format des `//`)
- `eslint-plugin-jsdoc` — `jsdoc/require-jsdoc` configurée pour interfaces uniquement
- Règle custom pour détecter les patterns `// OPE-XXX`

### 3. Proposition de convention

Rédiger une convention en 6-8 règles précises, avec exemples OK / NOK.
Format cible :

```
## Convention commentaires Operioz

### Règle 1 — ...
✅ ...
❌ ...

### Règle 2 — ...
...

### Gate ESLint
Règles à activer : ...
```

### 4. Livrable

1. Poster la convention en commentaire Linear OPE-510
2. Créer une issue enfant :
   - title: `chore(qualité): appliquer la convention commentaires + gate ESLint`
   - description: liste des fichiers prioritaires à nettoyer + config ESLint à ajouter
   - parentId: OPE-510
3. Passer OPE-510 en **Done**

## Règles

- Spike read-only (pas de commit)
- Utiliser MCP Linear pour poster le rapport et créer l'issue enfant
- Les commandes shell sont autorisées pour l'audit, mais pas d'édition de fichiers

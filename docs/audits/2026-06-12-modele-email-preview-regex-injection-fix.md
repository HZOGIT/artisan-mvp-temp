# Fix (MODE A) — `modelesEmail.preview` : clé de variable injectée non échappée dans `new RegExp` (throw 500 + ReDoS)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (robustesse / ReDoS auto-infligé, endpoint read-only)

> `modelesEmailRouter.preview` (`server/routers.ts:3483`). Classe « regex sur entrée
> utilisateur » (voisine de la validation couleurs/regex).

---

## Constat

L'aperçu d'un modèle d'email remplace `{{clé}}` par sa valeur via un `RegExp` construit
**avec la clé brute** (contrôlée par l'utilisateur) :

```ts
preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
```

Deux défauts :
1. **Clé malformée** (parenthèses/crochets déséquilibrés, ex. `((`) → `new RegExp(...)`
   **throw** → **500** au lieu d'un aperçu.
2. **Clé piégée** (ex. `(a+)+`, `(.*)*`) → **ReDoS** : backtracking catastrophique sur le
   `contenu`, bloquant le thread Node.

Sweep : c'est le **seul** `new RegExp(` avec interpolation du codebase
(`grep -rn "new RegExp(" server/`) ; le chemin d'envoi réel des modèles n'utilise pas ce
pattern. Périmètre **isolé** à ce endpoint (query, read-only, self-inflicted).

## Fix appliqué (`server/routers.ts:3488`)

Échappement des métacaractères regex de la **clé** avant injection :
```ts
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
... new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, 'g') ...
```

- **Behavior-preserving** : un nom de variable normal (`nom`, `date`, `montant`) ne contient
  aucun métacaractère → `escapeRegex` est un **no-op**, le `RegExp` est identique. Seules les
  clés contenant des métacaractères sont désormais traitées **littéralement** (comportement
  attendu : la variable est nommée telle quelle dans le gabarit).
- **Blast radius** : une ligne, un endpoint d'aperçu. Aucune décision produit.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Durcissement robustesse (ReDoS auto-infligé, LOW) sur un endpoint read-only — pas de vecteur
cross-tenant ni d'amplification. **Pas d'issue Linear** ; documenté ici.

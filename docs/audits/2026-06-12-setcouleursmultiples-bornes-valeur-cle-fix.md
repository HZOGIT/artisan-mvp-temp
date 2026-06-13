# Fix (MODE A) — `setCouleursMultiples` : valeurs/clés du record non bornées (ER_DATA_TOO_LONG + clés NaN)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (robustesse/validation, rattaché OPE-24)

> `interventionsRouter.setCouleursMultiples` (`server/routers.ts:2206`). Endpoint manqué par
> le sweep « bornes de longueur » (`2026-06-10-bornes-longueur-entrees-texte.md`).

---

## Constat

`setCouleursMultiples` prenait `couleurs: z.record(z.string(), z.string())` — **clés et
valeurs non bornées**. La valeur est écrite telle quelle dans `couleurs_interventions.couleur`
**VARCHAR(20)** via un INSERT batch (`db.ts setCouleursMultiples`). Deux défauts :

1. **Valeur > 20 caractères** → `ER_DATA_TOO_LONG` → **500** (au lieu d'un 400 de validation).
   Incohérent avec l'endpoint **unitaire** voisin `setCouleurIntervention` (`:2178`) qui borne
   déjà `couleur: z.string().max(20)` (même colonne, même valeur = classe Tailwind « bg-blue-500 »).
2. **Clé non numérique** → `parseInt(key)` = **NaN** → `interventionId` NaN inséré (clé attendue
   = un `interventionId` numérique).

## Fix appliqué (`server/routers.ts:2208`)

```ts
couleurs: z.record(z.string().regex(/^\d+$/), z.string().max(20)),
```
- **Valeur** bornée à 20 (alignée colonne + endpoint unitaire) → 400 clair au lieu d'un 500 DB.
- **Clé** = chaîne numérique (`^\d+$`) → plus de `NaN` en `interventionId`.
- **Behavior-preserving** : une classe Tailwind (`bg-blue-500`, < 20 car.) et des clés
  d'intervention numériques (le front envoie un record `interventionId -> couleur`) passent à
  l'identique. Seules les entrées **aberrantes** sont rejetées proprement.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Classe « bornes de longueur » → **rattachée à OPE-24** (entrées non bornées), comme le reste de
cette classe. **Pas d'issue Linear** ; documenté ici.

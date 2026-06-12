# Fix (MODE A) — Rapports personnalisés : bornes `.max()` create/update (ER_DATA_TOO_LONG). Exécution ORM = pas d'injection SQL.

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (validation/robustesse)

> `rapportsRouter.create`/`update` (`server/routers.ts:6127`/`:6147`). Classe « bornes de longueur »
> (OPE-24). + vérification **injection SQL** de l'exécution de rapport.

---

## ✅ Pas d'injection SQL dans l'exécution (vérifié au passage)

`executerRapport` (`server/db.ts:2561`) construit les résultats via **drizzle ORM** —
`db.select().from(<table>).where(eq(<col>.artisanId, rapport.artisanId)).orderBy(desc(...))` —
**branché sur le `type` (enum fixe)**, avec `orderBy` **codé en dur**. Les champs de config
**`groupement`/`tri`/`colonnes`** (contrôlés par l'utilisateur) **ne sont PAS interpolés** dans
du SQL brut → **aucune injection** (`ORDER BY ${tri}` / `GROUP BY ${groupement}` n'existent pas).
Scopé par `rapport.artisanId` (OPE-46, ownership déjà gardé au routeur). ✅

## Constat (le seul défaut) : entrées non bornées

`create`/`update` n'avaient **aucune** `.max()` sur des champs mappés à des **varchar** :
- `nom` `z.string().min(1)` → `rapports_personnalises.nom` **varchar(100)**.
- `groupement`/`tri` `z.string().optional()` → **varchar(50)** chacun.

→ une entrée surdimensionnée (appel API hors UI) provoque **ER_DATA_TOO_LONG (500)** en mode
strict au lieu d'un 400 de validation.

## Fix appliqué (`server/routers.ts:6128`/`:6148`)

Bornes alignées sur les colonnes : `nom.max(100)`, `groupement.max(50)`, `tri.max(50)`,
`description.max(2000)`, `colonnes` = `array(string.max(100)).max(100)` (defense-in-depth).

- **Behavior-preserving** : un nom/tri/groupement de rapport légitime est court → inchangé.
  Seules les entrées aberrantes sont rejetées proprement en 400. Blast radius : 2 inputs.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Classe « bornes de longueur » → **rattachée à OPE-24**. **Pas d'issue Linear** ; documenté ici.
(L'IDOR d'exécution est déjà couvert OPE-46.)

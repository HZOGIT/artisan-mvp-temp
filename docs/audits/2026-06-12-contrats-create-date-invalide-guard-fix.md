# Fix (MODE A) — `contrats.create` : date invalide → 500 (timestamp NOT NULL) + `prochainFacturation` cassé

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (robustesse, authentifié)

> `contratsRouter.create` (`server/routers.ts:4622`). Même classe que le garde de date de
> `demanderRdv` (validation d'entrée date).

---

## Constat

`contrats.create` parsait les dates **sans validation** :
```ts
const dateDebut = new Date(input.dateDebut);          // input.dateDebut: z.string() (aucune validation de format)
let prochainFacturation = new Date(dateDebut);
// …
dateFin: input.dateFin ? new Date(input.dateFin) : undefined,
```

Une `input.dateDebut` malformée → `Invalid Date`, qui part dans
`contrats_maintenance.dateDebut` (`timestamp().notNull()`, `schema.ts`) → **500** MySQL en mode
strict (rejet d'une date invalide sur colonne NOT NULL), et **casse silencieusement**
`prochainFacturation` (toute comparaison `prochainFacturation <= now` du scheduler est `false`
sur une date invalide). Le front envoie un sélecteur de date valide ; le cas n'arrive que par
appel API direct.

## Fix appliqué (`server/routers.ts:4642`)

Garde `isNaN(getTime())` sur `dateDebut` (NOT NULL) **et** `dateFin` (si fournie) → rejet propre
en **400** :
```ts
const dateDebut = new Date(input.dateDebut);
if (isNaN(dateDebut.getTime())) throw BAD_REQUEST("Date de début invalide");
let dateFin: Date | undefined;
if (input.dateFin) { dateFin = new Date(input.dateFin); if (isNaN(dateFin.getTime())) throw BAD_REQUEST("Date de fin invalide"); }
```

- **Behavior-preserving** : une date valide (sélecteur front) passe à l'identique. Seules les
  entrées **invalides** sont rejetées (400 au lieu d'un 500 / d'un contrat à date corrompue).
- **Blast radius** : un endpoint, ownership déjà géré. Pas de logique financière modifiée (simple
  validation d'entrée). 

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Classe « validation de date » (robustesse), même esprit que le garde `demanderRdv`. **Pas d'issue
Linear** ; documenté ici. (NB : l'IDOR `clientId` non vérifié de `contrats.create` est un sujet
**distinct**, déjà filé **OPE-25** — non traité ici.)

# Fix (MODE A) — `interventions.create` : date invalide → 500 (timestamp NOT NULL)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (robustesse, authentifié)

> `interventionsRouter.create` (`server/routers.ts:2047`). Même classe que les gardes de date
> `demanderRdv` et `contrats.create`. Endpoint **cœur** (workflow quotidien des interventions).

---

## Constat

L'input inline n'a **pas** de validation de format de date (`dateDebut: z.string()`, `:2054` —
n'utilise pas le `DateSchema` regex+refine de `shared/validation.ts`). `new Date(input.dateDebut)`
(`:2071`) sur une chaîne malformée → `Invalid Date`, qui part dans `interventions.dateDebut`
(`timestamp().notNull()`, `schema.ts`) → **500** MySQL en mode strict. Le front envoie un
sélecteur valide ; le cas n'arrive que par appel API direct, mais la 500 est inélégante.

## Fix appliqué (`server/routers.ts:2059`)

Garde `isNaN(getTime())` sur `dateDebut` (NOT NULL) **et** `dateFin` (si fournie) → **400** clair :
```ts
const dateDebut = new Date(input.dateDebut);
if (isNaN(dateDebut.getTime())) throw BAD_REQUEST("Date de début invalide");
let dateFin: Date | undefined;
if (input.dateFin) { dateFin = new Date(input.dateFin); if (isNaN(dateFin.getTime())) throw BAD_REQUEST("Date de fin invalide"); }
```

- **Behavior-preserving** : une date valide (sélecteur front) passe à l'identique. Seules les
  entrées **invalides** sont rejetées (400 au lieu d'un 500).
- **Blast radius** : un endpoint, ownership + scope client déjà gérés. Pas de logique financière.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Classe « validation de date » (robustesse), même esprit que `demanderRdv`/`contrats.create`.
**Pas d'issue Linear** ; documenté ici.

> Reste de la classe (non traité ce firing, marginal) : autres `new Date(input.x)` authentifiés
> (`interventions.update` dateIntervention, `contrats.createIntervention`…). À balayer si besoin.

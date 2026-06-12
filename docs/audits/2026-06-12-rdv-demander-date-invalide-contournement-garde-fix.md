# Fix (MODE A) — `demanderRdv` : date invalide contournait le contrôle des 24h (+ borne sup ajoutée)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (robustesse, borné par token portail)

> Suite de l'audit [`2026-06-11-rdv-demander-bornes-validation-ok.md`] (réserves LOW).
> Endpoint : `clientPortal.demanderRdv` (`server/routers.ts:4400`).

---

## Constat corrigé

L'audit du 2026-06-11 listait 4 réserves LOW sur `demanderRdv`. Depuis :
- **Point 3 (rate-limit)** : ✅ déjà ajouté — `checkPortalActionRate(...)` (`:4413`).
- **Point 4 (bornes `.max()`)** : ✅ déjà ajouté — `titre` max 200, `description` max 5000 (`:4403-4404`).

Restaient **point 1** (date invalide) et **point 2** (futur absurde) :

```ts
const dateProposee = new Date(input.dateProposee);   // input = z.string().max(40), AUCUNE validation de format
const minDate = new Date(Date.now() + 24*60*60*1000);
if (dateProposee < minDate) { /* BAD_REQUEST */ }     // NaN < minDate === false  → BYPASS
```

Une `input.dateProposee` malformée donne `Invalid Date`. Le test `dateProposee < minDate`
est alors **faux** (`NaN < n` est toujours `false`) → la garde « créneau ≥ 24h à l'avance »
est **silencieusement contournée**, et la valeur part vers la colonne
`rdv_en_ligne.dateProposee` (`timestamp().notNull()`, `schema.ts:1624`) → en MySQL strict,
**500** (au lieu d'un 400 clair) ou insertion de date corrompue.

## Fix appliqué (`server/routers.ts:4417`)

Avant le contrôle des 24h, ajout d'un garde de validité, puis d'une borne supérieure :

```ts
const dateProposee = new Date(input.dateProposee);
if (isNaN(dateProposee.getTime())) throw BAD_REQUEST("Date proposée invalide");
const minDate = ...;
if (dateProposee < minDate) throw BAD_REQUEST("Le creneau doit etre au moins 24h a l'avance");
const maxDate = new Date(Date.now() + 2*365*24*60*60*1000);   // 2 ans
if (dateProposee > maxDate) throw BAD_REQUEST("La date proposée est trop éloignée");
```

- **Behavior-preserving** : toute date légitime (entre +24h et +2 ans) passe exactement
  comme avant. Seules les entrées **invalides** ou **absurdes** (année 9999) sont désormais
  rejetées proprement (400) au lieu de contourner la garde / provoquer un 500.
- **Blast radius** : un seul endpoint public token-gated, scopé au client/artisan du token.
  Pas de décision produit (2 ans = au-delà de tout créneau d'intervention réel), pas de
  logique financière.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear

Conforme à la décision de l'audit source (réserves LOW « bornées par le token portail ») :
**pas d'issue dédiée**. Documenté ici. Les points 1 & 2 sont désormais **clos** ; les 4
réserves LOW de `demanderRdv` sont toutes traitées.

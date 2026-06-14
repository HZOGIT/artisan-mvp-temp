# Audit — Sweep de complétude des handlers `async ({ input })` (IDOR) — inventaire quasi complet

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Objectif : balayer **tous** les handlers de procédures protégées écrits
> `async ({ input })` (sans `ctx`) dans `routers.ts`, et vérifier que chacun est
> soit scopé, soit déjà couvert par une issue IDOR existante — pour confirmer que
> l'inventaire (OPE-9/10/30/31/38/45/46/47) est complet.

---

## Méthode

Grep des routes `(protected|*Procedure)` dont le handler est `async ({ input })`
(pas de `ctx`) → ~31 emplacements. Attribution de chacun à son routeur et à
l'issue correspondante.

## Résultat : chaque route IDOR est déjà filée — sauf 2 (ajoutées à OPE-46)

| Routeur / routes `({ input })` | Couverture |
| -- | -- |
| `fournisseurs` assoc. (3110/3116/3122/3134) | **OPE-47** (étendu 2026-06-08) |
| `comptabilite.genererEcrituresFacture` (5431) | **OPE-38** |
| `devisOptions` getByDevisId/getOptions/updateLigne/delete (5495-5539) | **OPE-9/10** |
| `rapports.delete` / `toggleFavori` / `executer` / `historique` | **OPE-46** |
| **`rapports.getById` (5652)** / **`rapports.update` (5678)** | **← non nommées dans OPE-46 → ajoutées par commentaire** |
| `notificationsPush` save/unsubscribe/prefs/historique (5743-5778) | **OPE-31** |
| `conges.byTechnicien` (5817) / `conges.delete` (5896) | **OPE-31 / OPE-45** |
| `vehicules` getById/update/delete/kilométrage/entretien (6004-6128) | **OPE-47** |
| `badges` update/delete/getBadgesTechnicien/attribuer/objectifs (6189-6235) | **OPE-47** |
| `devisIA.getById` (6704) | **OPE-30** |

## Les 2 routes non explicitement nommées — `rapports.getById` / `update`

```typescript
// routers.ts:5652 getById — lit la DÉFINITION d'un rapport de n'importe quel tenant
.query(async ({ input }) => db.getRapportPersonnaliseById(input.id))
// routers.ts:5678 update — modifie un rapport de n'importe quel tenant
.mutation(async ({ input }) => { const { id, ...data } = input; return db.updateRapportPersonnalise(id, data); })
```

Même routeur, même cause racine, **même fix** qu'OPE-46 (qui liste déjà
executer/historique/delete/toggleFavori). `getById` lit la **config** d'un rapport
d'autrui (impact plus faible que `executer` qui fuit les **données**) ; `update`
permet de **modifier** un rapport d'autrui (intégrité). → **Ajoutées à OPE-46** par
commentaire pour compléter la liste (6/6 routes du routeur).

---

## Conclusion

L'inventaire IDOR `({ input })` est **complet** : 100 % des routes protégées sans
`ctx` qui agissent sur un id sont déjà filées (OPE-9/10/30/31/38/45/46/47), à
l'ajout près de `rapports.getById`/`update` (consolidées dans **OPE-46**). **Pas de
nouvelle issue.** Le chantier de remédiation transverse (helper `assertOwner` /
`artisanId` dans les `WHERE`) recommandé dans OPE-47 reste la bonne approche pour
fermer l'ensemble en une passe.

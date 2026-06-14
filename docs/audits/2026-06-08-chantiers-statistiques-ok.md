# Audit — Chantiers (worksites) & Statistiques — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `chantiersRouter` (`routers.ts:6270`) — chantiers, phases,
> interventions liées, documents, suivi (étapes visibles client) — et
> `statistiquesRouter` (`:7159`).

---

## Conclusion : aucun BLOCKER/HIGH. Les deux modules sont correctement isolés.

### Chantiers — ownership systématique

Toutes les routes vérifient l'appartenance via le helper **`assertChantierOwner`**,
y compris les routes « par id d'entité enfant » qui **chargent puis vérifient** le
`chantierId` parent :

- `getById`/`update`/`delete` → `assertChantierOwner(input.id, …)`.
- `getPhases`/`createPhase` → `assertChantierOwner(input.chantierId, …)` ;
  `updatePhase`/`deletePhase` → `getPhaseChantierById` puis
  `assertChantierOwner(phase.chantierId, …)`.
- `getInterventions`/`associer`/`dissocier` → `assertChantierOwner(chantierId, …)`.
- `getDocuments`/`addDocument` → `assertChantierOwner(chantierId, …)` ;
  `deleteDocument` → charge le doc puis `assertChantierOwner(doc.chantierId, …)`.
- `getSuivi`/`createSuivi`/`updateSuivi` (étapes `visibleClient`) →
  `assertChantierOwner(chantierId, …)`.

Le suivi exposé au **portail client public** passe par
`clientPortal.getSuiviChantiers`, qui récupère les chantiers de l'artisan **puis
filtre `c.clientId === access.clientId`** (cf. audit portail) et n'expose que
`getSuiviVisibleClient`. Rendu côté `PortailClient.tsx` en **JSX** (échappé) → pas
de XSS. **Pas d'IDOR, pas de fuite cross-tenant.**

### Statistiques — entièrement scopées

`getDevisStats`/`getFacturesStats`/`getCAMensuel`/`getTopClients`/
`getTauxConversion` résolvent l'artisan et passent `artisan.id` aux helpers
(`dbSecure.getDevisByArtisanIdSecure`, `getFacturesByArtisanId`,
`getMonthlyCAStats`, `getTopClients`, `getConversionRate`). **Pas d'IDOR.**

---

## Réserves (mineures, déjà tracées ou à faible impact)

1. **`chantiers.create` ne valide pas `clientId`** (`routers.ts:6299`) : un artisan
   peut créer un chantier référençant un `clientId` d'un autre tenant. Impact
   **faible** (le chantier reste sous l'`artisanId` de l'attaquant ; ses lectures
   scopées ne résolvent pas le client étranger). À durcir avec un
   `getClientByIdSecure(clientId, artisan.id)` — même classe que les autres
   « clientId non validé » déjà notées. Pas d'issue dédiée.

2. **`statistiques.getFacturesStats` — `montantImpaye` inclut les `brouillon`**
   (`routers.ts:7184` : `else if (f.statut !== 'annulee')`) → un **brouillon**
   (non émis, pas une créance) est compté comme impayé. **Incohérent** avec le
   dashboard (`getDashboardStats` exclut `brouillon` : `statut NOT IN
   ('payee','annulee','brouillon')`). Impact **faible** (widget de stats
   surévalue les impayés). De plus `montantPaye` somme le `totalTTC` des `payee` →
   **CA en TTC** (OPE-53) et **paiement partiel marqué payée** (OPE-60). Relève de
   ces deux issues + une correction triviale du filtre `brouillon`.

---

## Verdict

Chantiers (ownership `assertChantierOwner` partout, suivi portail filtré + échappé)
et statistiques (scoping `artisanId` systématique) **vérifiés sains**. Réserves :
un `clientId` non validé à la création (faible) et un `montantImpaye` qui inclut à
tort les brouillons (faible, recoupe OPE-53/OPE-60). **Pas d'issue Linear créée.**

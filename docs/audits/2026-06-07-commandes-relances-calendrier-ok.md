# Audit — Commandes fournisseurs / relances / portail / calendrier — RAS bloquant

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `commandesFournisseursRouter` (`routers.ts:3263`), `relancesRouter`
> (`:7215`), `portailRouter` (`:7244`), `calendrierRouter` (`:7277`).
> **Aucun BLOCKER/HIGH** → pas d'issue. Une note de complétude MEDIUM.

---

## Ce qui fonctionne correctement

### Commandes fournisseurs — ownership systématique (bon exemple)
Bien qu'il utilise `db.getCommandeFournisseurById(id)` **brut**, le routeur
**vérifie l'appartenance inline sur chaque mutation** :
`getById`/`update`/`updateStatut`/`delete`/`sendEmail` → tous
`commande.artisanId !== artisan.id` ⇒ FORBIDDEN (`routers.ts:170,276,339,359,374`).
`genererDepuisDevisIA` vérifie `devis.artisanId` **et** applique un rate limit
(`checkRateLimit`). **Pas d'IDOR.** ✓

> Contraste utile avec OPE-47 : ici le pattern « getById brut » est **sauvé par un
> check d'ownership explicite dans chaque handler ». Le défaut d'OPE-47 n'est donc
> pas l'usage de `getById` brut en soi, mais l'absence du check qui doit
> l'accompagner.

### Relances / portail / calendrier — lecture seule, scopés
- `relances.list` (`:7216`) : `getDevisNonSignes(artisan.id)`, read-only. ✓
- `portail.listClients` (`:7245`) : `getClientsByArtisanId(artisan.id)` +
  `getPortalAccessByClientId(client.id, artisan.id)`. ✓
- `calendrier.getEvents` (`:7278`) : `dbSecure.getInterventionsByArtisanIdSecure`. ✓

> Note : il n'existe **pas** de module de relance facture avec calcul de
> pénalités de retard / indemnité 40 € (le « recouvrement » se limite à des
> listes + notifications internes). Donc **pas de risque de calcul de pénalité
> erroné** — mais c'est une feature absente, pas un bug.

---

## 🟡 MEDIUM (documenté, pas d'issue) — réception d'une commande ne met pas à jour le stock

`commandes.updateStatut` (`routers.ts:3589`) vers `'livree'` ne fait que changer
le statut :

```typescript
const updateData = { statut: input.statut, dateLivraisonReelle: ... };
return await db.updateCommandeFournisseur(input.id, updateData);
// ← aucun increment de stock pour les articles reçus
```

→ Marquer une commande **« livrée » n'ajoute pas les quantités commandées au
stock**. L'artisan doit réajuster manuellement via le module Stocks. Ce n'est pas
une corruption (donc pas de double-stock), mais une **intégration manquante**
commande → stock.

Impact limité car le module Stocks est isolé (cf. audit stocks : non lié aux
factures/compta). À câbler si l'on veut un vrai suivi de stock
(increment idempotent à la première bascule en `livree`).

---

## Conclusion

Commandes fournisseurs, relances, portail et calendrier sont **sûrs**
(scoping/ownership corrects). Aucun BLOCKER/HIGH. Seule remarque : la réception de
commande ne réapprovisionne pas le stock (intégration absente, non critique).

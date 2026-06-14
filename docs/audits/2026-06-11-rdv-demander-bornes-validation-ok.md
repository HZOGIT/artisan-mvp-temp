# Audit — RDV en ligne `demanderRdv` : token-gated OK, validation date LOW

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `clientPortal.demanderRdv` (`routers.ts:4178-4217`).

---

## Conclusion : pas d'IDOR. Réserves de validation LOW. Pas de BLOCKER/HIGH.

### Cloisonnement correct

`access = getClientPortalAccessByToken(input.token)` (token validé : isActive + non
expiré) → `UNAUTHORIZED` sinon. `createRdvEnLigne({ artisanId: access.artisanId,
clientId: access.clientId, … })` → scopé au client/artisan du **token** (pas d'input
`artisanId`/`clientId`). Pas d'IDOR.

### 🟡 Réserves LOW (robustesse / abus, bornées par le token portail)

1. **Date invalide acceptée** : `dateProposee = new Date(input.dateProposee)` sans
   `isNaN(getTime())`. Le check `if (dateProposee < minDate)` est **faux** pour une date
   invalide (`NaN < n === false`) → un `input.dateProposee` malformé **passe** et crée un
   RDV à date invalide. Fix : `if (isNaN(dateProposee.getTime()) || dateProposee < minDate)
   → BAD_REQUEST`.
2. **Pas de borne supérieure** : `dateProposee` peut être dans un futur absurde (année
   9999) → pollution de données (demande que l'artisan ignore). Reco : `dateProposee <
   now + 6 mois` (ou borne raisonnable).
3. **Pas de rate-limit** : un porteur de token portail peut **spammer** `demanderRdv` →
   flood de demandes + notifications à l'artisan. Borné à un **client légitime** (token
   par-client) → impact faible. Reco : limiter (ex. 5 demandes en attente / client).
4. `input.titre`/`description` sans `.max()` → classe « bornes de longueur » déjà
   documentée.

Tout est **LOW** : tied à un token portail valide (client légitime/compromis), impact =
données RDV d'un seul tenant, pas de sécurité/finance.

### Note XSS

`input.titre` dans la notification (`:4212`) est rendu en **in-app** (JSX React →
auto-échappé). Pas de sink HTML brut.

---

## Verdict

`demanderRdv` est **token-gated et scopé** (pas d'IDOR). Réserves = validation de
`dateProposee` (date invalide passe le check + pas de borne sup) et absence de rate-limit
→ **LOW** (bornées par le token portail). **Pas de nouvelle issue Linear.**

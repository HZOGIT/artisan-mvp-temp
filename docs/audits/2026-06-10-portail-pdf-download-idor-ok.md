# Audit — Téléchargement PDF via le portail client (devis/facture) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `/api/portail/:token/devis/:id/pdf` (`index.ts:394-418`),
> `/api/portail/:token/factures/:id/pdf` (`:420-444`). Endpoints **publics**
> (token-gated), surface de téléchargement de documents légaux.

---

## Conclusion : token-gated + ownership vérifié. Pas d'IDOR. Pas de BLOCKER/HIGH.

Enjeu : le token donne accès au portail d'**un** client ; si le `:id` du devis/facture
n'était pas re-vérifié, un client pourrait télécharger le **PDF d'un autre client** (même
artisan ou autre) en énumérant les `:id` → fuite de documents financiers + PII.

### Token validé à la source

`access = getClientPortalAccessByToken(req.params.token)` → renvoie `null` si **inactif**
ou **expiré** (filtre SQL `isActive=true AND expiresAt>=now`, confirmé audit portail) →
`403`. Donc un lien révoqué/expiré ne télécharge rien.

### Ownership du document vérifié contre le client du token

```typescript
// devis (:400-401)
const devisData = await getDevisById(parseInt(req.params.id));
if (!devisData || devisData.clientId !== access.clientId) return res.status(404)...

// facture (:426-427)
const facture = await getFactureById(parseInt(req.params.id));
if (!facture || facture.clientId !== access.clientId) return res.status(404)...
```

→ Le devis/facture doit appartenir à **`access.clientId`** (dérivé du token, non falsifiable).
Changer `:id` pour viser le document d'un autre client → **404**. **Pas d'IDOR.**

`artisan`/`client` sont résolus depuis `access.artisanId`/`access.clientId` (token), pas
depuis l'entrée.

> Même pattern correct que les procédures tRPC du portail (déjà -ok) — ici la variante
> Express brute, tout aussi gardée.

---

## Verdict

Téléchargement PDF portail : **token validé** (révocation/expiration effectives) +
**ownership** `document.clientId === access.clientId` → aucun accès cross-client. Pas
d'IDOR. **Pas de nouvelle issue Linear.**

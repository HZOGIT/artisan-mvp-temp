# Audit — Création d'avoir (note de crédit) : ownership + validation du montant — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `factures.createAvoir` (`routers.ts:1684-1758+`), guards d'immutabilité
> facture (`:1333`, `:1393`).

---

## Conclusion : flux d'avoir robuste. Pas de BLOCKER/HIGH.

Enjeux : un avoir mal gardé = fraude (avoir > facture → net négatif / remboursement
indu), IDOR (avoir sur la facture d'un autre tenant), double-crédit.

### Isolation tenant (pas d'IDOR)

`factureOrigine = dbSecure.getFactureByIdSecure(input.factureOrigineId, artisan.id)`
(`:1703`) → `NOT_FOUND` si la facture n'appartient pas au tenant. Permission-gated
(`facturesCreerProcedure`).

### Validation du montant (anti-sur-crédit)

1. **Pas d'avoir sur brouillon** (`:1707`).
2. **Anti-doublon total** : si un avoir couvrant **intégralement** la facture existe déjà
   → `FORBIDDEN` (`:1719-1728`).
3. **Solde restant** : `soldeRestant = factureTotalTTC − Σ|avoirs existants|` (`:1730`) ;
   rejet si ≤ 0 (`:1732`).
4. **Plafond du nouvel avoir** : `nouveauMontantTTC` recalculé depuis les lignes, **rejet
   si `> soldeRestant`** (`:1748-1753`) → **impossible de créditer plus que le solde
   restant** de la facture. `Math.abs()` sur quantités/prix → signes normalisés (pas
   d'avoir « négatif » détourné).
5. Numérotation dédiée `getNextAvoirNumber` (`:1755`).

### Immutabilité fiscale (contexte)

Le `facturesRouter` **verrouille** les documents validés : modification (`:1333`) et
suppression (`:1393`) → `FORBIDDEN` (« Émettez un avoir pour corriger/annuler »). Le bon
pattern de correction (avoir) est donc **imposé** (à confirmer vs OPE-50 côté devis).

---

## Verdict

`createAvoir` : **ownership** (`getFactureByIdSecure`), **anti-doublon**, **solde restant**
calculé, **plafond** strict (avoir ≤ solde, `Math.abs`), permission-gated. Pas de
sur-crédit, pas d'IDOR. Un des flux les mieux construits. **Pas de nouvelle issue Linear.**

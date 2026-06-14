# Benchmark/QA — Avoir : le montant est **correctement plafonné** à la facture d'origine (anti sur-crédit). Aucun ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Vérification de correctness **à fort enjeu** : un avoir (note de crédit) qui **dépasse** la
> facture d'origine = **sur-crédit** (perte / vecteur de fraude). `createAvoir`
> (`server/routers.ts:1832`) ↔ Odoo `account` (avoir `out_refund` borné au move d'origine).

---

## Conclusion : le plafonnement est **robuste et correct**. Aucune issue.

### ✅ Garde-fous vérifiés (`routers.ts:1846-1900`)

1. **Tenant-scopé** : `getFactureByIdSecure(factureOrigineId, artisan.id)` (`:1851`).
2. **Pas d'avoir sur brouillon** (`:1855`).
3. **Anti 2ᵉ avoir total** : si un avoir couvrant déjà **intégralement** la facture existe
   (`|avoir.TTC − factureTTC| < 0.01`), rejet (`:1868-1876`).
4. **Plafond au solde restant** :
   - `totalCouvert = Σ |avoir.totalTTC|` des avoirs existants (`:1862`).
   - `soldeRestant = factureTotalTTC − totalCouvert` ; si `≤ 0.01` → rejet « entièrement
     couvert » (`:1879-1885`).
   - Montant du **nouvel** avoir recalculé depuis ses lignes (valeurs absolues, `:1889-1895`) ;
     si `nouveauMontantTTC > soldeRestant + 0.01` → **rejet** « dépasse le solde disponible »
     (`:1896-1900`).

→ **Impossible** d'émettre un avoir qui **dépasse** la facture, ni de **cumuler** des avoirs
au-delà du total. Les avoirs **partiels** s'accumulent correctement (le `soldeRestant` décroît).
Tolérance `0.01` = arrondi. Conforme à la logique Odoo (un avoir ne peut pas excéder le document
d'origine).

> Cohérent avec le reste de la chaîne avoir déjà vérifiée : montants **négatifs** stockés,
> **inversion** au FEC/écritures en valeur absolue (OPE-136), PDF « Avoir » (OPE-165), Factur-X
> TypeCode 381 (OPE-19).

---

## Verdict

Le **montant d'un avoir** est **correctement plafonné** (anti sur-crédit + anti double-crédit,
accumulation partielle juste). **Pas de vecteur de sur-crédit.** **Aucun nouveau ticket.**

> Bilan de la série QA-correctness sur les **montants légaux** : totaux TVA multi-taux → écritures
> stockées → FEC export → CA3 → **plafond avoir** : **tous corrects**. Les seuls défauts trouvés
> étaient **structurels** (lookup cross-tenant OPE-176 corrigé ; orphelins de suppression
> OPE-177 ; atomicité stock sur OPE-104), pas des **erreurs de calcul** — le moteur de chiffres
> est sain.

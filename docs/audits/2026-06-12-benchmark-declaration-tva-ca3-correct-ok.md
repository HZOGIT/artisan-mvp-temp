# Benchmark/vérif — Déclaration de TVA (CA3) : calcul **correct** (collectée − déductible, avoirs inclus). Aucun ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> 3ᵉ passe de **QA de correctness** sur des chiffres légaux (après TVA-multitaux + équilibre FEC).
> Enjeu maximal : un calcul de **CA3 faux = TVA mal déclarée** (redressement). Vérification de
> `getDeclarationTVADetail` (`server/db.ts:2660`) ↔ Odoo `account` (tax report).

---

## Conclusion : la déclaration TVA est **correctement calculée**. Pas de bug. Aucun ticket.

### ✅ TVA collectée — par taux, avoirs déduits, brouillons/annulées exclus

`db.ts:2668-2683` : `SELECT tauxTVA, SUM(montantHT), SUM(montantTVA) FROM factures_lignes JOIN
factures WHERE statut IN ('validee','envoyee','payee','en_retard') GROUP BY tauxTVA`.
- Ventilation **par taux** (base HT + TVA), somme des `montantTVA` de ligne (cohérent avec le
  calcul des totaux et le FEC, déjà vérifiés). ✅
- **Brouillon / annulée exclus** (`statut IN (...)`) — un devis non finalisé ne déclare pas. ✅
- **Avoirs inclus et déducteurs** : `createAvoir` pose `statut: "validee"` (`routers.ts:1912`) →
  l'avoir est **dans** le périmètre, et ses lignes à **montants négatifs** (`:1926`) **réduisent**
  la TVA collectée via le `SUM`. ✅ (un avoir diminue bien la TVA à reverser — conforme.)

### ✅ TVA déductible

`db.ts:2685-2690` : `SUM(montant_tva) FROM depenses WHERE tva_deductible = TRUE` sur la période. ✅

### ✅ TVA nette + arrondis

`tvaNette = round(tvaCollectee − tvaDeductible)`, chaque composante arrondie à 2 décimales
(`:2683/2690/2691`). Formule CA3 standard. ✅

### Caveats du domaine = **déjà filés** (ce ne sont pas des erreurs de ce calcul)

- **Régime d'exigibilité** : la requête date sur `dateFacture` → régime des **débits**. Pour un
  prestataire de services sur le régime des **encaissements**, la TVA est exigible au **paiement**
  → **OPE-145** (déjà filé). C'est un choix de **date d'exigibilité**, pas une erreur d'agrégation.
- **Déductibilité partielle** (carburant 80 %…) : `tva_deductible` booléen tout-ou-rien → sur-
  déduction → **OPE-153** (déjà filé).

---

## Verdict

Le calcul de la **déclaration de TVA (CA3)** est **correct** : collectée par taux (avoirs
**déduits**, brouillons/annulées exclus) − déductible = nette, arrondis propres. **Pas de
risque de montant de TVA erroné** dans le calcul lui-même. Les deux nuances (régime
encaissements **OPE-145**, déductibilité partielle **OPE-153**) sont **déjà tracées**. **Aucun
nouveau ticket benchmark.**

> Vérifié au passage : le **PDF de facture affiche l'IBAN** pour règlement par virement
> (`pdfGenerator.ts:593-597`, IBAN MOD-97-validé) — la base « payer par virement » est couverte ;
> l'enrichissement QR EPC/SEPA reste **OPE-159**.

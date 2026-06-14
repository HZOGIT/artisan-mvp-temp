# Audit — Factur-X XML : TVA à taux unique → XML invalide (BR-CO-17) + CategoryCode codé en dur (→ OPE-19)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Complète **OPE-19** (FacturX non conforme : pas de PDF/A-3 hybride + MINIMUM sans
> lignes). Ici : même après correction de l'embarquement, le **contenu XML est
> invalide** pour les factures multi-taux et les artisans en franchise. Même racine
> TVA qu'OPE-58 (PDF), mais artefact **légalement distinct** (le XML structuré que
> valident PPF/PDP en 2026).

---

## Problème — le bloc TVA du XML est faux

`generateFacturXML` (`server/_core/facturx.ts`) émet **un seul** bloc
`ApplicableTradeTax` avec le **taux par défaut de l'artisan** :

```xml
<!-- facturx.ts:87-93 -->
<ram:ApplicableTradeTax>
  <ram:CalculatedAmount>${totalTVA}</ram:CalculatedAmount>   <!-- = facture.totalTVA STOCKÉ (somme par ligne, ex. 300) -->
  <ram:TypeCode>VAT</ram:TypeCode>
  <ram:BasisAmount>${totalHT}</ram:BasisAmount>              <!-- 2000 -->
  <ram:CategoryCode>S</ram:CategoryCode>                     <!-- CODÉ EN DUR "Standard" -->
  <ram:RateApplicablePercent>${tauxTVA}</ram:RateApplicablePercent>  <!-- = artisan.tauxTVA (20), pas le taux des lignes -->
</ram:ApplicableTradeTax>
```

`tauxTVA = parseFloat(a.tauxTVA || "20")` (`:20`).

### Défaut 1 — incohérence TVA (BR-CO-17) sur facture multi-taux

Exemple 1000 € HT @10 % + 1000 € HT @20 % → `totalTVA` stocké = **300**, `totalHT`
= 2000, `tauxTVA` = 20. Le bloc dit : base 2000 × 20 % = **400** ≠ `CalculatedAmount`
**300**. La règle **BR-CO-17** (EN16931 / Factur-X) impose
`CalculatedAmount = BasisAmount × RateApplicablePercent ÷ 100`. → **XML invalide**,
rejeté par tout validateur Factur-X / par le PPF-PDP. (Même cause qu'**OPE-58**,
artefact différent.)

### Défaut 2 — `CategoryCode` codé en dur `S` (+ rate forcé) → franchise/exonéré faux

Un micro-entrepreneur en **franchise de TVA** (art. 293 B, cf. **OPE-21**) doit
émettre `CategoryCode = E` (exonéré) avec un motif d'exonération et rate 0. Ici
`CategoryCode` est toujours `S` et, si `a.tauxTVA` est null, le rate **retombe à
20 %** (`|| "20"`). → XML faux pour les artisans en franchise (BR-E-* / BR-S-*).

### Impact

Operioz **vend** la « **Conformité facturation 2026** » (Home.tsx:300, 601, 639,
FAQ 1345-1347 « Operioz est déjà conforme »). Or le XML Factur-X produit est
**non valide** dès qu'une facture mêle des taux (taux réduit 10 % bâtiment, 5,5 %
énergie) ou qu'un artisan est en franchise → **allégation de conformité trompeuse**
+ rejet par les plateformes de dématérialisation en 2026.

### Fix proposé

1. **Ventilation par taux** : grouper les lignes par `tauxTVA`, émettre **un
   `ApplicableTradeTax` par taux** (base + TVA du groupe), avec
   `CalculatedAmount = base × taux/100` (cohérence BR-CO-17). Réutiliser le même
   calcul partagé que le fix d'OPE-58 (PDF) pour ne pas re-diverger.
2. **CategoryCode dynamique** : `S` (standard), `E` (exonéré/franchise + motif),
   etc., selon le régime de l'artisan / le taux de la ligne (lié à OPE-21).
3. Idem dans la **summation** : `ApplicableTradeTax` multiples cohérents avec
   `TaxTotalAmount`.

### Estimation

~0,5 j — ventilation par taux + CategoryCode + test de validation Factur-X
(validateur FNFE-MPE) sur facture multi-taux et franchise.

---

→ **OPE-19 étendu par commentaire** (défaut de **contenu** XML, complémentaire du
défaut d'**embarquement** déjà décrit). Pas de nouvelle issue.

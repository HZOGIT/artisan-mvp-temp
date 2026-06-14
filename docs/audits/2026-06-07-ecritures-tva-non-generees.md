# Audit — Avoirs & déclaration TVA (écritures comptables non générées)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `factures.createAvoir` (`routers.ts:1674`), `getRapportTVA` /
> `getDeclarationTVA`, et la génération des écritures comptables
> (`genererEcrituresFacture`). Distinct d'OPE-33 (format FEC) et OPE-38 (IDOR
> sur genererEcrituresFacture).

---

## Ce qui fonctionne correctement

- **`createAvoir`** est solide : ownership (`getFactureByIdSecure`), refus sur
  brouillon, **garde anti sur-avoir** (doublon total + dépassement du solde
  restant), lignes en **montants négatifs**, `typeDocument='avoir'`,
  `recalculateFactureTotals` (totaux négatifs), audit log. ✓
- L'avoir produit donc un document correct (TTC négatif) lié à la facture
  d'origine.

---

## 🔴 BLOCKER — Déclaration TVA fausse : les écritures comptables ne sont JAMAIS générées automatiquement

### Problème

`getRapportTVA` / `getDeclarationTVA` (`db.ts`) ne calculent **pas** la TVA depuis
les factures, mais depuis la table **`ecritures_comptables`** :

```typescript
// db.ts getRapportTVA — somme sur les écritures
if (e.numeroCompte.startsWith('44571')) tvaCollectee += parseFloat(e.credit);   // TVA collectée
else if (e.numeroCompte.startsWith('44566')) tvaDeductible += parseFloat(e.debit);
```

Or cette table n'est écrite **que** par `genererEcrituresFacture` (`db.ts:2626`),
elle-même appelée **uniquement** par la mutation **manuelle**
`comptabilite.genererEcrituresFacture` (`routers.ts:5429`). Vérifié :

```
grep genererEcrituresFacture  → un seul appelant (la mutation manuelle)
grep "insert(ecrituresComptables)" → un seul writer (dans genererEcrituresFacture)
```

**Aucune génération automatique** d'écritures à la création / validation / envoi
d'une facture, ni à la création d'un **avoir**, ni au paiement.

### Conséquence

En usage normal, `ecritures_comptables` reste **vide** (l'artisan ne déclenche
jamais la génération manuelle facture par facture). Donc :

- **La déclaration TVA in-app affiche ~0** (`tvaCollectee`/`tvaDeductible`
  proches de zéro) → **chiffre faux** que l'artisan pourrait reporter sur sa
  déclaration réelle → **sous-déclaration de TVA** (risque fiscal).
- Le **grand livre** et la **balance** (mêmes lectures sur `ecritures_comptables`)
  sont également vides/faux.
- L'avoir, bien que correct en tant que document, **ne réduit jamais la TVA
  collectée** (son écriture négative n'est pas générée non plus).

> Deux sources de vérité divergentes : le **FEC** se construit à la volée depuis
> les `factures` (fonctionne, modulo le format — OPE-33), mais la **déclaration
> TVA / grand livre / balance** se construit depuis `ecritures_comptables` (jamais
> peuplée). Incohérence structurelle du module comptable.

### Fix proposé

1. **Générer les écritures automatiquement** au moment où la facture devient un
   document fiscal (passage en `validee`/`envoyee`) et à la **création d'un
   avoir** (écriture inverse, TVA négative au 44571). P.ex. appeler
   `genererEcrituresFacture(facture.id)` dans le flux de validation/envoi et dans
   `createAvoir`.
2. **OU** calculer `getRapportTVA` directement depuis les `factures`+`lignes`
   (comme le FEC), en incluant les avoirs (TVA négative), et abandonner la
   dépendance à `ecritures_comptables` pour la déclaration.
3. Backfill : générer les écritures des factures déjà émises.

### Estimation

~1 j — auto-génération sur validation/avoir + backfill + test (déclaration TVA =
somme attendue, avoir réduit bien la TVA).

---

## Estimation totale

- BLOCKER (TVA déclarée fausse car écritures non générées) : ~1 j

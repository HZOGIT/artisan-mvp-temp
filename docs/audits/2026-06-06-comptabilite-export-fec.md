# Audit — Comptabilité / Export FEC

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : la génération du **FEC** (Fichier des Écritures Comptables, format
> légal Art. A47 A-1 LPF) téléchargé depuis la page Comptabilité.
> Route : `GET /api/comptabilite/fec` (`server/_core/index.ts:546`), branchée
> directement sur le bouton « Générer le FEC » (`Comptabilite.tsx:67`).
> Le produit le vend comme un argument de conformité (`Home.tsx:639,1347`).

---

## Ce qui fonctionne correctement

- Auth par cookie + scope `artisan.id` (pas d'IDOR sur l'export).
- En-tête FEC : 18 champs dans le bon ordre. ✓
- Équilibre débit/crédit par écriture : Débit 411 (TTC) = Crédit 701 (HT) +
  Crédit 445710 (TVA), avec TTC = HT + TVA. ✓
- Montants au format français (virgule décimale), dates `YYYYMMDD`. ✓

---

## 🔴 BLOCKER — Le FEC généré est structurellement non conforme (17 colonnes au lieu de 18)

### Preuve

Les lignes de données (`server/_core/index.ts:581-587`) se terminent toutes par
`||||EUR` après le crédit :

```typescript
// index.ts:581
lines.push(`VE|...|${ecritureLib}|${fecAmount(ttc)}|${fecAmount(0)}||||EUR`);
```

Décompte des colonnes (vérifié programmatiquement) — **17 champs vs 18 en
en-tête** :

| # | Champ attendu | Valeur produite |
| -- | -- | -- |
| 12 | Debit | `1200,00` |
| 13 | Credit | `0,00` |
| 14 | EcritureLet | `` |
| 15 | DateLet | `` |
| 16 | **ValidDate** | `` ← **vide** (champ obligatoire) |
| 17 | **Montantdevise** | `EUR` ← valeur de devise dans une colonne de **montant** |
| 18 | **Idevise** | **absente** |

Trois défauts cumulés :
1. **Chaque ligne a 17 colonnes, l'en-tête 18** → fichier structurellement
   invalide, **rejeté par l'outil DGFiP « Test Compta Demat »**.
2. **`ValidDate` (champ obligatoire**, date de validation de l'écriture) est
   **vide** — alors que la variable `validDate` est calculée (`index.ts:577`)
   mais **jamais utilisée**.
3. `"EUR"` est écrit dans **Montantdevise** (montant en devise) au lieu d'
   **Idevise** ; pour une écriture en monnaie nationale (EUR), `Montantdevise`
   ET `Idevise` doivent rester **vides**.

### Impact

Le FEC est un **livrable légal** présenté en cas de contrôle fiscal. Un fichier
malformé est refusé d'emblée par l'administration. Le produit annonçant
« export FEC conforme / Conformité 2026 » (`Home.tsx:639,1347`), c'est en plus
une **allégation trompeuse**.

### Fix

Émettre 18 colonnes, remplir `ValidDate`, laisser `Montantdevise`/`Idevise`
vides en EUR :

```typescript
// Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise
`...|${fecAmount(ttc)}|${fecAmount(0)}|||${validDate}||`
```

(appliquer aux 3 lignes 581 / 583 / 586). Ajouter un test qui vérifie que
chaque ligne a exactement 18 champs et idéalement valide via Test Compta Demat.

### Estimation

~1 h — réalignement des 3 templates + test de comptage de colonnes.

---

## 🟠 HIGH — FEC incomplet : journal des ventes uniquement (ni encaissements ni achats)

### Problème

La route ne génère **que le journal des ventes (VE)** à partir des factures
(`index.ts:567-588`). Il manque :
- **Les encaissements** (journal de banque/caisse) : aucune écriture
  `Débit 512 / Crédit 411` lors du paiement d'une facture → le **compte client
  411 n'est jamais soldé** ; le FEC présente toutes les ventes comme non réglées
  et le journal de trésorerie est totalement absent.
- **Les achats/dépenses** (journal AC) : un générateur `exportFecAchats` existe
  séparément côté tRPC, mais ce FoC téléchargé ne l'inclut pas.

Un FEC doit refléter **l'intégralité des écritures** de l'entité sur la période,
tous journaux confondus et équilibrés. En l'état il est incomplet pour un
contrôle (et pour un micro-entrepreneur tenu en recettes-dépenses, l'absence
d'encaissements est particulièrement visible).

### Fix

Construire le FEC à partir de **toutes** les écritures de la période (ventes +
encaissements + achats), idéalement depuis la table `ecritures_comptables`
(source unique) plutôt qu'en régénérant à la volée depuis les seules factures.

### Estimation

~1 j — agrégation multi-journaux + génération des écritures d'encaissement.

---

## Estimation totale

- BLOCKER (structure 18 colonnes + ValidDate) : ~1 h
- HIGH (complétude multi-journaux) : ~1 j

# Audit — Schéma : types monétaires & contraintes d'intégrité — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `drizzle/schema.ts` — types des colonnes monétaires/quantités sur toutes les
> tables financières (devis, factures, lignes, paiements, dépenses, contrats, commandes,
> stocks), contraintes `unique`, FK `references()`/`onDelete`.

---

## Conclusion : stockage monétaire sain (pas de float). Pas de BLOCKER/HIGH **nouveau**.

### 1) ✅ Aucune corruption flottante possible — tout l'argent est en `DECIMAL`

Point critique pour un produit de **facturation/compta** : un montant stocké en
`FLOAT`/`DOUBLE` corromprait les totaux (0.1+0.2≠0.3). Vérifié :

- `grep float|double|real` sur `schema.ts` → **0 résultat**.
- Tous les montants (`totalHT/TVA/TTC`, `montantHT/TVA/TTC`, `prixUnitaireHT`,
  `prixAchat`, `montant`, `montantPaye`, `cout`, `coutReel`) sont en
  **`decimal(10,2)`** (cap ~100 M €, large pour un artisan) ou **`decimal(12,2)`** pour
  les agrégats commandes/prévisions (`:1438`, `:1516`).
- Taux/pourcentages (`tauxTVA`, `remise`, `tauxConversion`) en `decimal(5,2)` → cohérent.
- `soldeInitial/soldeRestant/joursAcquis/joursPris` en `decimal(5,2)` = **solde de
  congés en jours** (`soldes_conges`, `:1041-1050`), pas de l'argent → cap 999.99 jours
  OK.

→ Le driver `mysql2` renvoie ces colonnes en **string** ; le code applique
`Number()/parseFloat()` + `.toFixed(2)` — pas de stockage flottant, l'arrondi ligne-à-ligne
reste un sujet de *calcul* déjà couvert (issues TVA par-ligne / arrondi).

### 2) Unicité

- 1:1 par artisan (`parametres`, abonnement…) : `artisanId … .unique()` (`:276`, `:1254`,
  `:1392`, `:1544`). Tokens (`signature`, `portail`, `sessions`, `avis`) `.unique()`. OK.

### 3) FK / `onDelete`

- **Une seule** FK déclarée avec cascade : `sessions.userId → users onDelete:cascade`
  (`:1604`) — table de sessions Lucia, éphémère → **bénin**.

---

## Écarts = intégrité référentielle, **déjà filés** (anti-doublon → pas de nouvelle issue)

1. **Quasi-aucune contrainte FK au niveau DB** : `artisanId`/`clientId`/`devisId`… sont des
   `int` **sans `.references()`**. L'intégrité tenant + référentielle repose **uniquement
   sur le code applicatif**. Conséquence directe = **orphelins** possibles (supprimer un
   client laisse des factures pointant un `clientId` mort) → **déjà filé**
   (« Suppression d'un client casse l'identité de ses factures »). C'est aussi le terreau
   de la classe IDOR (déjà balayée/filée).
2. **`devis.numero` / `factures.numero` `notNull()` mais NON `unique()`** au schéma
   (`:138`, `:185`) → l'unicité n'est posée qu'**au runtime** par `fix-duplicates.ts`
   (`ADD UNIQUE INDEX unique_*_artisan_numero`). Numérotation non atomique → **déjà filé**
   (« Numérotation factures non atomique + aucune contrainte UNIQUE »).

---

## Verdict

Schéma financier : **types monétaires corrects** (`DECIMAL` partout, **zéro float**),
précision suffisante, unicité posée sur les 1:1 et les tokens, pas de cascade dangereuse.
Les écarts d'**intégrité référentielle** (absence de FK DB → orphelins ; `numero` unique
seulement au runtime) sont **déjà tracés**. **Pas de nouvelle issue Linear.**

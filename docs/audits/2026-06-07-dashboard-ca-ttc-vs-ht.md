# Audit — Dashboard / statistiques : chiffre d'affaires en TTC au lieu de HT

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : calcul du chiffre d'affaires affiché (`getDashboardStats`,
> `getMonthlyCAStats`, top clients, YoY, rapport financier).

---

## Ce qui fonctionne correctement

- Toutes les requêtes CA sont **scopées** `WHERE artisanId = ?` (pas d'IDOR). ✓
- Agrégations SQL (`SUM`) performantes, en parallèle. ✓
- Le CA mensuel/annuel est sur base **encaissée** (`statut = 'payee'`), choix
  défendable pour un « CA encaissé ». ✓ (mais cf. label ci-dessous)

---

## 🟠 HIGH — Le « Chiffre d'affaires » est calculé en TTC (TVA incluse), pas en HT

### Problème

Toutes les sommes de CA utilisent **`totalTTC`** (montant TVA incluse) :

```sql
-- db.ts getDashboardStats:1444 (caMonth) / :1453 (caYear)
SELECT COALESCE(SUM(totalTTC), 0) AS total FROM factures
 WHERE artisanId = ? AND statut = 'payee' AND ...
```
```typescript
// getMonthlyCAStats:1547, YoY:1619-1620, rapport financier db.ts:2500
ca: monthFactures.reduce((sum, f) => sum + parseFloat(f.totalTTC ...), 0)
```

Or côté UI ces valeurs sont libellées **« Chiffre d'affaires »** :
`Dashboard.tsx:318` (« CA du mois » = `stats.caMonth`), `:328` (« CA » =
`stats.caYear`), `Objectifs.tsx:80` (« Chiffre d'affaires »).

**Le chiffre d'affaires se définit HT** (hors taxes). Sommer le TTC **gonfle le CA
affiché du montant de la TVA** (≈ +20 % au taux normal). Aucun calcul HT n'existe
(`grep totalHT` en contexte CA → 0) : l'erreur est **systématique**.

### Impact

- **Chiffre faux et structurellement surévalué** (~20 %) partout où le CA est
  montré (dashboard, graphes mensuels, top clients, comparaison annuelle,
  objectifs, rapport financier).
- **Suivi des seuils faussé** : la franchise en base de TVA (CA HT < 37 500 € /
  85 000 €) et les plafonds micro se mesurent **HT**. Un artisan qui suit son CA
  TTC sur Operioz se croit plus proche/au-delà des seuils qu'il ne l'est, ou
  l'inverse — avec des conséquences fiscales réelles (bascule à la TVA).
- Les objectifs de CA (widget `Objectifs`) comparent des cibles à un CA TTC.

### Secondaire — avoirs non déduits

Le CA ne compte que `statut = 'payee'`. Les **avoirs** (`typeDocument='avoir'`,
`statut='validee'` — cf. `createAvoir`) ne sont donc **jamais déduits** : un
remboursement n'allège pas le CA affiché.

### Fix proposé

1. **Calculer le CA en HT** : `SUM(totalHT)` au lieu de `SUM(totalTTC)` dans tous
   les calculs de CA (dashboard, mensuel, top clients, YoY, rapport financier).
2. **Déduire les avoirs** (TTC/HT négatifs) sur la période, ou inclure
   `typeDocument='avoir'` dans la somme (montants déjà négatifs).
3. Si un indicateur « encaissements TTC » est voulu en plus, le **libeller
   explicitement** (≠ « chiffre d'affaires »).

### Estimation

~3 h — bascule TTC→HT sur ~5 calculs + déduction avoirs + test (CA = somme HT
attendue, avoir réduit le CA).

---

## Estimation totale

- HIGH (CA en TTC au lieu de HT + avoirs non déduits) : ~3 h

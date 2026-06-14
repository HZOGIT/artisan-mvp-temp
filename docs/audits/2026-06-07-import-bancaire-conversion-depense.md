# Audit — Import relevé bancaire & conversion en dépense

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `importReleve`, `convertirTransaction`, `ignorerTransaction`,
> `getTransactionsBancaires` (`server/routers.ts:8712+`), rapprochement bancaire.

---

## Ce qui fonctionne correctement

- **Scope multi-tenant OK (pas d'IDOR)** :
  - `importReleve` / `getTransactionsBancaires` : `db.*(artisan.id, …)`. ✓
  - `convertirTransaction` ne cherche la transaction **que dans les transactions
    de l'artisan** (`getTransactionsBancaires(artisan.id).find(id === …)`) →
    un `transactionId` d'un autre tenant donne `NOT_FOUND`. ✓
  - `ignorerTransaction` passe `artisan.id` au helper. ✓
- Parsing CSV tolérant (séparateur auto `;`/`,`, date FR→ISO, débit/crédit). ✓
- La dépense créée est en `statut: "brouillon"` (modifiable avant validation). ✓

---

## 🟠 HIGH — `convertirTransaction` crée des dépenses à montants NÉGATIFS → TVA déductible & FEC achats faussés

### Problème

À l'import, un **débit** bancaire (= une vraie dépense, sortie d'argent) est
stocké avec un `montant` **négatif** :

```typescript
// routers.ts:8742 — débit stocké négatif
montant = !isNaN(credit) && credit > 0 ? credit : -Math.abs(debit || 0);
// :8749
typeTransaction: montant < 0 ? "debit" : "credit",
```

Mais `convertirTransaction` réutilise ce montant **tel quel**, sans valeur
absolue :

```typescript
// routers.ts:8778-8781
const montantTtc = Number(t.montant || 0);            // ← négatif pour un débit
const tauxTva = 20;
const montantHt = +(montantTtc / (1 + tauxTva / 100)).toFixed(2);   // négatif
const montantTva = +(montantTtc - montantHt).toFixed(2);            // négatif
```

La dépense est donc créée avec `montantHt`, `montantTva`, `montantTtc`
**négatifs** (`createDepense`, `:8782`).

### Impact

La conversion d'une transaction bancaire en dépense est le cœur du
« rapprochement bancaire ». Or chaque dépense ainsi créée a des montants
négatifs, ce qui fausse des **figures fiscales** :

- **TVA déductible** : `getRapportTVA` somme les `montant_tva` des dépenses. Un
  `montantTva` négatif **réduit** la TVA déductible (voire inverse le signe) →
  la **déclaration de TVA** (`tvaNette = collectée − déductible`) est **fausse**
  (TVA à payer sur-évaluée).
- **FEC achats** : `exportDepensesFEC` (`:8816`) émet des montants négatifs.
- Statistiques de dépenses (`getDepensesStats`) faussées.

Le signe négatif n'est pas forcément remarqué (la dépense apparaît, le brouillon
peut être validé tel quel), et l'erreur se propage silencieusement à la
déclaration de TVA.

### Fix proposé

Prendre la **valeur absolue** du montant à la conversion :

```typescript
const montantTtc = Math.abs(Number(t.montant || 0));
```

(et éventuellement refuser/avertir si la transaction est un **crédit** — un
encaissement n'est pas une dépense).

### Estimation

~20 min — `Math.abs` + garde crédit + test conversion débit→dépense.

---

## Point secondaire (documenté, < HIGH)

**`importReleve` sans borne de taille** : `contenuCsv: z.string()` sans `.max()`,
boucle sur **toutes** les lignes → insertion massive possible (même classe que
l'`importFromExcel` d'OPE-24). À borner (`.max()` sur le nombre de lignes /
taille) dans le même lot qu'OPE-24.

---

## Estimation totale

- HIGH (dépenses négatives à la conversion) : ~20 min

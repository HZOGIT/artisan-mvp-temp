# Benchmark/QA — Stock : ajustement de quantité — scoping multi-tenant + bornes ✅ OK (1 réserve LOW sur la réception OPE-166)

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA de correctness, classe IDOR/intégrité)

> Sweep de **tous** les appelants de `adjustStock` (`server/db.ts:1222`), qui n'est **pas scopé
> en interne** (prend un `stockId` brut, modifie `quantiteEnStock` + journalise un mouvement).
> Chaque appelant DOIT donc vérifier l'appartenance du stock au tenant. ↔ Odoo `stock.move`.

---

## Conclusion : tous les chemins d'ajustement de stock sont **tenant-safe** et **bornés**. Pas d'IDOR.

`adjustStock(id, quantity, type, motif, reference)` a **2 appelants** :

### ✅ 1) Ajustement manuel — `stocks.adjustQuantity` (`server/routers.ts:3310-3319`)

```ts
const stock = await db.getStockById(input.stockId);
if (!stock || stock.artisanId !== artisan.id) throw NOT_FOUND;   // ← ownership ✓
return await db.adjustStock(input.stockId, input.quantite, input.type, …);
```
- **Ownership vérifié** (`:3316`) → un artisan ne peut ajuster que **ses** stocks (pas d'IDOR cross-tenant).
- **Quantité bornée `>= 0`** (`:3305`) → empêche le bug « quantité négative passée à une `sortie` inverse l'opération » (`currentQty − (−5)` = +5). Borne haute aussi. ✅

### ✅ 2) Entrée automatique à la réception — `commandesFournisseurs.recevoir` (`server/routers.ts:4127`, OPE-166)

```ts
const stock = await db.getStockById(avant.stockId);
if (stock && stock.artisanId === artisan.id) {              // ← ownership ✓
  await db.adjustStock(avant.stockId, Math.abs(delta), delta > 0 ? "entree" : "sortie", …);
}
```
- **Ownership vérifié** avant ajustement → un `stockId` étranger (ligne de commande forgée) est **ignoré** (pas d'ajustement cross-tenant). ✅
- Commande elle-même **scopée** (`commande.artisanId === artisan.id` en amont). ✅
- **Delta-only** (variation, pas cumul) → réceptions partielles/incrémentales sans double-comptage ; **idempotent** si re-réception sans changement (delta = 0 → aucun mouvement). ✅

## Odoo 19

`stock` : un `stock.move` est toujours rattaché à une `company_id` ; les ajustements passent par des opérations scopées société. Operioz reproduit l'essentiel (vérif `artisanId` sur les 2 chemins).

## 🟡 Réserve LOW — dédoublonnage de `ligneId` à la réception (code OPE-166 récent)

`recevoir` lit la quantité reçue « avant » dans un **snapshot** `avantById` (figé en début d'opération), puis itère sur `input.lignes`. Si **le même `ligneId` apparaît deux fois** dans `input.lignes` (entrée client forgée/buggée), les deux itérations calculent leur delta depuis la **même** valeur « avant » → l'entrée en stock est **comptée deux fois** pour cette ligne.

- **Impact : LOW.** **Intra-tenant** (un artisan ne gonfle que **son propre** stock), **non cross-tenant**, et l'**UI n'envoie jamais** de `ligneId` en double (une entrée par ligne). Pas d'impact financier (quantité de stock, pas de montant). Auto-infligé.
- **Fix (trivial, si souhaité)** : dédoublonner `input.lignes` par `ligneId` (garder la dernière valeur) **avant** la boucle, ou mettre à jour `avantById` après chaque ajustement. Pas un ticket Linear (sous le seuil BLOCKER/HIGH) — noté ici comme **candidat correctif rapide**.

## Verdict

L'**ajustement de stock** est **correctement scopé** (ownership sur les 2 chemins : manuel + réception OPE-166) et **borné** (quantité ≥ 0). **Pas d'IDOR, pas d'inversion de mouvement.** Seule **réserve LOW** : dédoublonner `ligneId` à la réception (auto-infligé, UI safe). **Aucun ticket benchmark** (la réserve est sous le seuil HIGH ; corrigeable en MODE A si l'on veut durcir).

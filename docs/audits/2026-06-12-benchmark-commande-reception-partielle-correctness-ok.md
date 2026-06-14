# Benchmark/QA — Réception partielle commande fournisseur (`commandes.recevoir`, OPE-100) vs Odoo `purchase` — ✅ CORRECT

**Date** : 2026-06-12 · **Domaine** : Achats / Fournisseurs · **Type** : vérification de correctness (code récemment livré OPE-100)
**Verdict** : la réception partielle est **correcte** — idempotente, scopée tenant+commande, dérivation de statut saine, bornes présentes. **Pas de ticket** (le seul écart — réception ≠ mouvement de stock — est déjà assessé `-ok` / relève d'OPE-104).

---

## Notre état (`server/routers.ts` `commandes.recevoir` + `server/db.ts`)

`recevoir` enregistre `quantiteRecue` par ligne puis **dérive** le statut de la commande depuis les lignes (source de vérité).

### ✅ Idempotence — absolu, pas incrément
`updateLigneCommandeRecue` (`db.ts`) fait `SET quantiteRecue = qty` (valeur **absolue**), **pas** `+= qty` :
```ts
db.update(lignesCommandesFournisseurs)
  .set({ quantiteRecue: quantiteRecue.toFixed(2) })
  .where(and(eq(id, ligneId), eq(commandeId, commandeId)));
```
→ rejouer la même réception (double-clic / retry) **ne double-compte pas** ; une **correction** (reçu 8 puis corrigé à 5) est possible. Le statut est **recalculé** depuis les lignes à chaque appel.

### ✅ Scoping tenant + commande (pas d'écriture cross-commande)
- `commande.artisanId === artisan.id` requis (sinon FORBIDDEN).
- Les `ligneId` d'input sont filtrés sur `idsCommande` (lignes **de cette commande**) avant écriture ; `updateLigneCommandeRecue` re-scope en SQL par `commandeId`. → un `ligneId` étranger est **ignoré**, pas d'écriture sur une autre commande/tenant.

### ✅ Dérivation de statut (≈ Odoo `purchase.order.receipt_status`)
```
si statut ∉ {annulee, brouillon} :
  totalCommande>0 ET (toutes lignes reçu>=cmd)  → livree
  sinon si totalRecu>0                          → partiellement_livree
  sinon                                         → confirmee
```
- N'altère **jamais** un état terminal (`annulee`) ni un `brouillon` (réception réservée aux commandes confirmées/envoyées). ✅
- `toutRecu` exige que **chaque** ligne soit `reçu >= commandé` → pas de « livree » prématuré. ✅
- `dateLivraisonReelle` posée à la **1ʳᵉ** réception (totalRecu>0) si absente. ✅
- Bornes : `quantiteRecue ∈ [0, 1_000_000]` + array `.max(500)` (anti-DoS, OPE-24). ✅

### ✅ Sur-réception (reçu > commandé)
`recu < cmd` faux quand reçu>commandé → la ligne compte comme complète → `livree`. **Conforme Odoo** (`qty_received` peut dépasser `product_qty` ; la sur-livraison est permise). Pas de reliquat négatif exploité.

## Odoo 19 (`addons/purchase/models/purchase_order_line.py` + `purchase_order.py`)

- `qty_received` par ligne (distinct de `product_qty`) — exactement notre `quantiteRecue` vs `quantite`.
- `receipt_status` de la commande ∈ `{no, partial, full}` calculé depuis les lignes — identique à notre dérivation `confirmee / partiellement_livree / livree`.
- Différence **hors périmètre** : valider une réception Odoo crée un **`stock.picking` / stock.move** qui **incrémente l'on-hand**. Notre `recevoir` **ne touche pas** le stock.

## Écart connu (déjà assessé, pas de ticket ici)

Réception **n'incrémente pas** le stock de l'article (`articleId` de la ligne). Déjà noté `docs/audits/2026-06-10-commande-reception-stock-non-integre-ok.md` (jugé acceptable MVP) et relié à **OPE-104** (intégration stock ↔ flux). Pas un bug de correctness de `recevoir` (qui ne prétend pas mouvementer le stock).

## Conclusion

`commandes.recevoir` (OPE-100) est **correct et robuste** : idempotent (set absolu), scopé tenant+commande, dérivation de statut alignée Odoo, bornes présentes, états terminaux protégés. **Aucun ticket** — l'intégration stock à la réception reste un enrichissement déjà tracé (OPE-104 / note du 10-06).

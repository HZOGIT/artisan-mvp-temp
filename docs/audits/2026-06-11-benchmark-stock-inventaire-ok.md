# Benchmark — Stock / Inventaire (`stocks`) vs Odoo `stock` : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `stocks` (`drizzle/schema.ts:332`) + `mouvements_stock` (`:355`) +
> `stocksRouter` ↔ Odoo `stock` (`stock.quant`, `stock.location`, `stock.warehouse`,
> `stock.move`).

---

## Conclusion : domaine **au niveau MVP**. Les écarts à valeur sont **déjà filés** ; le reste est de l'ERP. Aucun nouveau ticket.

### ✅ Modèle suffisant pour un MVP artisan

| Concept Odoo `stock` | Operioz | État |
| -- | -- | -- |
| Quantité en stock (`stock.quant.quantity`) | `stocks.quantiteEnStock` | ✅ |
| Seuil de réappro (`reordering rule` min) | `stocks.seuilAlerte` | ✅ |
| Emplacement (`stock.location`) | `stocks.emplacement` (libellé libre) | ✅ (simple) |
| Mouvements (`stock.move` entrée/sortie/ajustement) | `mouvements_stock` (type entree/sortie/ajustement + quantité avant/après) | ✅ |

→ Le **journal de mouvements** avec `quantiteAvant`/`quantiteApres` donne une **traçabilité**
claire des variations. Le `seuilAlerte` couvre l'alerte de réappro.

### Écarts à valeur — **déjà tracés** (anti-doublon)

| Concept Odoo | Gap Operioz | Issue |
| -- | -- | -- |
| Sortie automatique à la vente/intervention (`stock.move` sur confirmation) | décrément manuel | **OPE-104** |
| Quantité **prévisionnelle** (entrant via commandes fournisseurs, `virtual_available`) | seul le réel | **OPE-105** |
| **Inventaire physique** (comptage théorique vs réel + écarts, `stock.quant` inventory mode) | uniquement des ajustements ponctuels | **OPE-129** |
| **Réapprovisionnement** (génération de commande sur seuil, `reordering rule`) | seuil détecté, pas d'action | **OPE-133** |

### Écarts restants = ERP / hors MVP (sur-ingénierie)

- **Multi-emplacements quantifiés** (`stock.quant` par `location` : atelier 5 / camion A 2 /
  camion B 3) + **transferts inter-emplacements** (`stock.move` entre locations) :
  pertinent pour un parc de **camions** stockés, mais c'est un **vrai module WMS**. Notre
  `emplacement` (libellé libre) suffit au MVP ; la quantité par emplacement est de la
  **sur-ingénierie** pour le 30 juin. *(Candidat « phase 2 » explicite, pas un ticket MVP.)*
- **Valorisation de stock** (PUMP / FIFO, `stock.valuation`), **lots / numéros de série**
  (`stock.lot`), **multi-entrepôts** (`stock.warehouse`), **routes/règles d'appro
  multi-étapes** : ERP pur, hors périmètre artisan.

---

## Verdict

Le module **Stock / Inventaire** est **au niveau MVP** : quantité, seuil d'alerte,
emplacement (libellé), journal de mouvements tracé (avant/après). Les 4 améliorations à
valeur (sortie auto, prévisionnel, inventaire physique, réappro) sont **déjà tracées**
(OPE-104/105/129/133). Le reste — **multi-emplacements quantifiés**, valorisation, lots,
multi-entrepôts — relève d'un **WMS/ERP** et serait de la **sur-ingénierie** pour le
lancement. **Aucun nouveau ticket benchmark.**

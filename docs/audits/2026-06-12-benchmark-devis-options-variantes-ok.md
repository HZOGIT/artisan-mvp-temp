# Benchmark — Devis : options / variantes (`devis_options`) vs Odoo `sale` (alternatives) : parité MVP (voire au-delà)

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `devis_options` (`drizzle/schema.ts:878`) + `devis_options_lignes` (`:900`) +
> `devisOptionsRouter` (`server/routers.ts:5771`) ↔ Odoo `sale` — **devis alternatifs**
> (« Alternatives ») et **produits optionnels** (`sale.order.option`).

---

## Conclusion : le domaine est **au niveau MVP** (et plus complet que le `sale` de base sur les variantes). Aucun nouveau ticket.

### ✅ Variantes de devis (« Standard / Premium ») — modèle complet

Operioz modélise des **variantes entières** d'un même devis, chacune avec ses propres lignes
et totaux :

| Concept | Operioz | État |
| -- | -- | -- |
| Variante nommée (« Option Standard / Premium ») | `devis_options.nom` + `description` + `ordre` | ✅ |
| Lignes propres à chaque variante | `devis_options_lignes` (désignation, qté, PU, TVA, **remise**, montants) | ✅ |
| Totaux par variante | `totalHT`/`totalTVA`/`totalTTC` (recalculés, `recalculerTotauxOption`) | ✅ |
| Variante **recommandée** par l'artisan | `recommandee` | ✅ |
| Variante **choisie** par le client | `selectionnee` + `dateSelection` (`selectDevisOption`) | ✅ |
| **Conversion** variante → devis (→ facture) | `convertirOptionEnDevis` (`routers.ts:5832`) | ✅ |
| Isolation multi-tenant | `assertOptionOwner` (`routers.ts:5761`, cf. audit `devisoptions-idor-routeur-complet`) | ✅ |

→ Le cycle complet **proposer plusieurs niveaux → le client choisit → conversion en devis
ferme → facturation** est en place. C'est l'équivalent des **devis alternatifs** d'Odoo
(plusieurs `sale.order` concurrents pour une même affaire), **mieux intégré** ici car les
variantes vivent dans un seul devis et la sélection client est tracée.

> Détail notable : `devis_options_lignes` porte une **`remise` par ligne** (`:910`) que les
> lignes de devis **standard** n'ont pas → renforce **OPE-102** (remise par ligne absente sur
> `devis_lignes`), déjà filé. Pas de doublon.

### Seul concept Odoo distinct = **produits optionnels add-on** (hors MVP)

Odoo `sale.order.option` = des **add-ons multi-sélectionnables** que le client **ajoute**
au devis au moment de signer (upsell : « +garantie 5 ans », « +dépose de l'ancien
équipement »), par opposition au **pick-one** des variantes.

- Le modèle **variantes** d'Operioz couvre déjà le besoin **dominant** de l'artisan (proposer
  2-3 niveaux de prestation). Les **add-ons multi-sélection** sont un raffinement d'upsell :
  utile mais **non prioritaire** pour le 30 juin, et approximable en créant une variante
  « avec option ». **Phase 2 explicite**, pas un ticket MVP (éviter la sur-ingénierie).

---

## Verdict

Les **options/variantes de devis** sont **au niveau MVP**, avec un cycle
proposition → sélection client → conversion → facturation **complet et tenant-isolé**. Le
seul écart (produits optionnels add-on multi-sélection d'Odoo) est un **raffinement d'upsell
hors périmètre MVP**. Le manque de **remise par ligne** sur les lignes de devis standard est
déjà tracé (**OPE-102**). **Aucun nouveau ticket benchmark.**

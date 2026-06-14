# Benchmark — Devis : modèles / ouvrages réutilisables vs Odoo (sale templates / kits) : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `modeles_devis` / `modeles_devis_lignes` (`drizzle/schema.ts`) +
> `devisRouter` (modeles) + `client/src/pages/DevisNouveauPage.tsx` ↔ Odoo
> `sale.order.template` (modèles de devis) et **produits kit** (`mrp.bom` type *kit*).

---

## Conclusion : le besoin « **ouvrages composés réutilisables** » est **déjà servi** par les modèles de devis (blocs de lignes insérables et cumulables). Aucun nouveau ticket.

### Hypothèse testée (et infirmée)

Je cherchais un gap « pas de bibliothèque d'**ouvrages composés** » (ex. « Remplacement
chauffe-eau » = matériel + main d'œuvre + raccords, insérable en bloc dans un devis).

### ✅ Constat dans le code : c'est implémenté via les modèles de devis

- `modeles_devis_lignes` : un modèle = un **ensemble nommé de lignes** (`designation`,
  `quantite`, `prixUnitaireHT`, `tauxTVA`, `unite`, `ordre`) → c'est exactement un **ouvrage**.
- `DevisNouveauPage.tsx:169` (`handleLoadModele`) : charge un modèle en **`setLignes([...lignes, ...newLignes])`** — il **APPEND** (ne remplace pas) et **réinitialise le sélecteur**
  (`setSelectedModeleId(null)`) → l'artisan peut **enchaîner plusieurs modèles** dans un même
  devis. **C'est le pattern « insérer un ouvrage composé »**.
- Gestion CRUD des modèles : `getModeles`, `createModele`, `addLigneToModele`,
  `getModeleWithLignes`, `deleteModele` (`routers.ts:1291-1367`).

→ Un artisan crée des modèles « Pose radiateur », « Remplacement chauffe-eau »… et en
**combine plusieurs** dans un devis. Le besoin BTP d'**ouvrages réutilisables** est couvert.

### Comparaison Odoo

| Concept Odoo | Operioz | État |
| -- | -- | -- |
| `sale.order.template` (modèle de devis) | `modeles_devis` (chargé en **append**) | ✅ (et insérable par bloc) |
| Produit **kit** (`mrp.bom` type kit, explosion en composants) | modèle = bloc de lignes figées | ✅ équivalent fonctionnel MVP |

### Écarts restants = raffinements / hors MVP

- **Validité/conditions par défaut** sur un modèle : **OPE-128** (déjà filé).
- **Lien dynamique** ligne de modèle ↔ `articlesArtisan` (mise à jour auto du prix
  catalogue) : refinement, non bloquant ; les modèles figent le prix au moment de la
  création (acceptable MVP).
- **Explosion de nomenclature / coût composant** (vrai `mrp.bom`) : sur-ingénierie ERP.

---

## Verdict

Le besoin **« ouvrages composés / blocs de lignes réutilisables »** (clé pour la rapidité
de chiffrage BTP) est **déjà couvert** : `modeles_devis` = ensembles de lignes nommés,
**insérés en append** (donc cumulables) dans un devis via `handleLoadModele`. Équivalent
fonctionnel MVP des `sale.order.template` + kits d'Odoo. Le seul écart (validité par défaut)
est **déjà filé (OPE-128)** ; le lien dynamique au catalogue et l'explosion de nomenclature
sont hors MVP. **Aucun nouveau ticket benchmark.**

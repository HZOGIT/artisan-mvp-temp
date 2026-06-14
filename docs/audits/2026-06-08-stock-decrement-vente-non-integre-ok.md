# Audit — Stock non décrémenté à la vente : limitation **par conception** (pas un bug) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : intégration stock ↔ ventes — `adjustStock` (`db.ts:970`),
> `stocksRouter`, schémas `devisLignes`/`facturesLignes`/`stocks`. Complète
> `2026-06-06-stocks-ok.md` (qui couvrait l'IDOR) sur l'angle « feature morte ».

---

## Question posée

Suite au pattern « feature morte » (OPE-51/70), vérifier si **vendre** (devis/
facture/intervention) **décrémente le stock** — sinon, l'inventaire serait
structurellement faux.

## Constat : stock & facturation sont **deux modules séparés par conception**

- `adjustStock(id, qty, 'entree'|'sortie'|'ajustement', …)` (`db.ts:970`) a **un
  seul appelant** : l'endpoint d'**ajustement manuel** (`routers.ts:2928`). Aucune
  création de devis/facture/intervention n'appelle `adjustStock`.
- **Pas de lien structurel** ligne ↔ stock : `devisLignes` et `facturesLignes`
  n'ont **ni `stockId` ni `articleId`** — uniquement `reference`/`designation` en
  **texte libre** (`schema.ts`). Décrémenter automatiquement nécessiterait un
  matching par chaîne `reference` (fragile), non implémenté.
- Il n'existe **aucun toggle UI** promettant un décrément automatique (contraste
  avec OPE-70 « recevoir par email/SMS » ou OPE-51 modèles).

→ Le stock est un **tracker d'inventaire manuel autonome** (CRUD + ajustements
`entrée/sortie` + alertes seuil/rupture sur la quantité saisie). Le non-couplage
avec la facturation est une **décision de conception** (absence de FK), **pas un
défaut d'une feature promise**. Donc **pas d'issue** (≠ OPE-70/51 qui ont une
promesse UI non tenue).

---

## Réserve (produit, à arbitrer — pas un bug)

Si Operioz entend **vendre** la gestion de stock comme **intégrée** à la
facturation (décrément auto à la vente, alertes rupture déclenchées par les
ventes réelles), alors l'intégration **manque** :
- les niveaux de stock, `getLowStockItems`, `getStocksEnRupture` ne reflètent
  **jamais** les ventes → inventaire faux sauf saisie manuelle après chaque vente.

**Recommandation produit** (hors périmètre blocker) : soit (a) clarifier que le
stock est **manuel** (libellé UI), soit (b) ajouter un `stockId`/`articleId` FK sur
les lignes + décrément `sortie` à la validation de facture. À trancher au niveau
produit ; ce n'est pas un blocker légal/sécurité.

---

## Verdict

Pas de « feature morte » ici : l'absence de décrément auto est **cohérente avec le
schéma** (pas de FK ligne↔stock, pas de promesse UI). Stock = module manuel
assumé. **Pas d'issue Linear.** Seule réserve : décision **produit** sur
l'intégration stock↔ventes, à arbitrer (non bloquante).

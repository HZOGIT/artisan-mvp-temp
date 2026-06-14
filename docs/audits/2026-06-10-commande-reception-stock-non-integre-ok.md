# Audit — Réception commande fournisseur → incrément de stock (non intégré, manuel par design) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `commandesFournisseurs.updateStatut` (`routers.ts:3598-3620`), intégration
> stock ; symétrie avec `stock-decrement-vente-non-integre-ok` (déjà audité).

---

## Conclusion : le passage en « livrée » n'incrémente pas le stock — cohérent avec un module stock **manuel**. Pas de BLOCKER/HIGH.

### Le stock n'est pas auto-incrémenté à la réception

`updateStatut` accepte `statut ∈ {brouillon, envoyee, confirmee, livree, annulee}` +
`dateLivraisonReelle`, puis fait `updateCommandeFournisseur(id, { statut, … })` (`:3619`)
— **rien d'autre**. Au passage en **`livree`**, les quantités commandées **ne sont pas
ajoutées** à `quantiteEnStock`. (`grep` incrément stock lié à une commande dans `db.ts` =
0.)

### Cohérent avec le module stock **manuel** (déjà acté)

- Le décrément de stock **à la vente/facturation** est lui aussi **non intégré** → **déjà
  audité `-ok`** (`stock-decrement-vente-non-integre-ok`), conclu **acceptable / par
  design** (le stock est un **inventaire manuel** : CRUD + alertes + ajustement manuel).
- Le présent constat est la **symétrie côté achats** : ni les achats (réception) ni les
  ventes (facturation) ne meuvent automatiquement le stock → **module manuel cohérent**,
  pas une régression. Le stock **est lu** (suggestions de réappro `genererDepuisDevisIA`,
  alertes « stock bas »), mais **écrit manuellement**.

→ Design assumé (inventaire manuel), pas une feature « morte » silencieuse : le CRUD et les
alertes fonctionnent. Pas un blocker de lancement (même verdict que l'audit symétrique).

### Isolation tenant OK

`updateStatut` : `commande.artisanId !== artisan.id → FORBIDDEN` (`:3610`). Pas d'IDOR.
(La FK-injection à la **création** est couverte par `commandes-fournisseurs-idor-fk` filé.)

---

## Réserve (LOW)

- Si le produit **promet** une gestion de stock **automatique**, l'absence de mouvement
  auto (achats + ventes) serait à clarifier côté marketing. Mais c'est un **choix de
  périmètre**, pas un bug ; à confirmer côté produit (comme la note de l'audit
  décrément-vente).

---

## Verdict

La réception d'une commande fournisseur **ne meut pas le stock** automatiquement, **comme**
la vente (déjà `-ok`) → **module d'inventaire manuel cohérent** (lu pour alertes/réappro,
écrit à la main). Isolation tenant correcte. **Pas de nouvelle issue Linear** (même verdict
que l'audit symétrique décrément-vente).

# Benchmark — Re-vérification (valorisation stock, remise globale, clôture comptable) : déjà couvert/décidé. Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Passe d'anti-doublon sur trois pistes candidates. Résultat : toutes **déjà filées** ou
> **explicitement hors-MVP**. Aucun ticket créé (anti-doublon/anti-over-ticketing).

---

## 1. Valorisation du stock (Σ quantité × prix d'achat) ↔ Odoo `stock` valuation

- Vérifié : aucune agrégation `quantiteEnStock × prixAchat` n'est calculée (`grep` négatif ;
  `stocksRouter` n'a que `list/getById/create/update/delete/adjustQuantity/getMouvements/getLowStock/generateAlerts`).
- **Déjà filé** : **OPE-105** (« quantité prévisionnelle **+ valorisation** » — la valorisation
  est dans son périmètre). Le **coût de référence** de l'article (prérequis) = **OPE-143**.
  → Pas de ticket.

## 2. Remise globale (geste commercial sur le total) ↔ Odoo `sale`

- Vérifié : ni `devis`/`factures` (en-tête : `totalHT/TVA/TTC` seuls) ni `devis_lignes` ne
  portent de remise ; aucun `remiseGlobale`.
- **Décidé** : la **remise par ligne** est **OPE-102** (High), qui **scope explicitement hors
  MVP** la « remise globale pied de devis ». La piste globale est donc **déjà tranchée
  (hors-MVP)** — ouvrir un ticket contredirait cette décision. → Pas de ticket.

## 3. Verrouillage de période / clôture comptable ↔ Odoo `account` lock dates

- Vérifié (concept) : `configurations_comptables` a `exerciceDebut` mais aucune date de
  verrouillage empêchant l'édition d'une période déclarée (TVA/FEC).
- **Déjà filé** : **OPE-119** (« pas de clôture d'exercice / date de verrouillage »). Distinct
  de l'immutabilité **par document** (audits `facture-lifecycle-immutabilite-ok`, OPE-50). → Pas de ticket.

---

## Verdict

Les trois pistes sont **couvertes** (OPE-105 valorisation, OPE-143 coût, OPE-119 clôture) ou
**décidées hors-MVP** (remise globale, OPE-102). **Aucun nouveau ticket benchmark.**

> Constat méthodo : le projet benchmark est **saturé** sur les modules cœur **et** une grande
> partie des secondaires. Les firings récents n'ont produit de la valeur qu'en visant des
> angles **acquisition/terrain** réellement vierges (OPE-172 capture de leads, OPE-173 temps
> passé intervention, OPE-174 sollicitation groupée). Prochaines pistes encore non comparées à
> explorer : **canal SMS** (envoi devis/lien par SMS), **réponse publique de l'artisan aux
> avis**, **export/sauvegarde des données (portabilité RGPD)** — à valider Odoo-groundables et
> MVP avant ticket.

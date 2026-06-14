# Benchmark — Passe de re-vérification (Congés, Stock/réappro, Chantiers) : couverture confirmée, aucun nouveau ticket

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Objet : passe d'anti-doublon approfondie sur trois domaines déjà notés `-ok`, pour vérifier
> qu'aucun **nouveau** gap à valeur n'avait été manqué. Résultat : tous les écarts identifiés
> sont **déjà filés**. Un seul **enrichissement** (commentaire sur OPE-133), pas de ticket.

---

## Congés (`conges` / `soldes_conges`) ↔ Odoo `hr_holidays`

- **Décompte en jours calendaires** (`server/routers.ts:6207/6246/6267` : `jours = Math.ceil(diff/86400000) + 1`, ajusté seulement des demi-journées via `demiJourneeDebut/Fin`) → **n'exclut ni week-ends ni jours fériés** → solde **sur-décrémenté** pour un congé à cheval sur un week-end. Odoo calcule `hr.leave.number_of_days` via `resource_calendar_id` (`hr_leave.py:166/176`) + jours fériés (`resource.calendar.leaves`).
  → **Déjà filé : OPE-96** (cf. note `benchmark-conges-hr-holidays-ok`). Acquisition auto des CP = **OPE-125**. Chevauchement/solde = **OPE-97**.
- Modèle par ailleurs complet (demi-journées, types, soldes CP/RTT, workflow validation, idempotence du décompte). **Aucun nouveau ticket.**

## Stock → Achats (réapprovisionnement) ↔ Odoo `stock.warehouse.orderpoint`

- Boucle stock→achat (générer une commande sur seuil bas, groupée par fournisseur) = **déjà OPE-133**.
- **Enrichi OPE-133** ce jour : `articles_fournisseurs` (`schema.ts:395`) manque **`quantiteMin`** (≈ `product.supplierinfo.min_qty`) et **`prefere`/`sequence`** (fournisseur préféré quand un article a plusieurs sources) — détails **dans le périmètre** d'OPE-133, pas un ticket séparé (anti-over-ticketing).
- Décrément auto = **OPE-104**, prévisionnel = **OPE-105**, inventaire physique = **OPE-129**. **Aucun nouveau ticket.**

## Chantiers / Projets ↔ Odoo `project` (analytique)

- Heures main-d'œuvre prévu/réalisé = **OPE-106** ; coût réel/rentabilité auto-agrégés = **OPE-107** ; taux horaire technicien = **OPE-123** ; facturation à l'avancement/acompte = **OPE-116/117**. Modèle `chantiers`/`phases_chantier` (budget/coûtRéel présents mais non alimentés auto). **Aucun nouveau ticket.**

---

## Verdict

La couverture benchmark de ces trois domaines est **complète** : chaque écart à valeur est déjà
tracé (OPE-96/97/125, OPE-104/105/129/133, OPE-106/107/123/116/117). Seul ajout : **enrichissement
d'OPE-133** avec les champs `quantiteMin` + `prefere` (`product.supplierinfo`). **Aucun nouveau
ticket benchmark** ce firing — discipline anti-doublon/anti-over-ticketing.

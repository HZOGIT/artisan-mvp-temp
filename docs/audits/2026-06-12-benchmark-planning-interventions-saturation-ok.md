# Benchmark — Planning / Interventions : domaine entièrement couvert. Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Re-vérification du planning/interventions ↔ Odoo `project` / `calendar` / Field Service.
> Résultat : tous les écarts à valeur sont **déjà filés**. Aucun ticket.

---

## Sonde de ce firing : détection de conflit / double-booking

- Vérifié : `interventions.create`/`update`/`assignerTechnicien` (`server/routers.ts:2017+`,
  `:2085`) assignent un `technicienId` + `dateDebut`/`dateFin` **sans aucun contrôle de
  chevauchement** — un technicien peut être **double-booké** silencieusement, et ses **congés**
  ne sont pas pris en compte. (`grep` négatif sur tout helper `conflit/disponibilite/overlap`.)
- **Déjà filé : OPE-110** (High) — « aucune détection de conflit à l'affectation d'un technicien
  (double-booking + congés ignorés) ». Formulation exacte du gap. → Pas de ticket.

## Couverture complète du domaine planning/interventions (anti-doublon)

| Écart | Issue |
| -- | -- |
| Conflit/double-booking + congés à l'affectation | **OPE-110** |
| Équipe (plusieurs techniciens) sur une intervention | **OPE-111** |
| Technicien (ressource) ↔ user de connexion non liés | **OPE-124** |
| Synchro calendrier externe (iCal/.ics) | **OPE-156** |
| Rappel de RDV **au client** (no-shows) | **OPE-171** |
| Durée réelle sur site → facturation régie | **OPE-173** |
| Bon d'intervention / compte-rendu PDF signé | **OPE-161** |

---

## Verdict & constat méthodo

Le domaine **planning/interventions** est **entièrement couvert**. **Aucun nouveau ticket.**

> **Saturation du benchmark** : c'est le 3ᵉ firing récent où **toutes** les sondes (client 360,
> réponse aux avis, conflit planning) sont **déjà filées ou en parité**. Le projet benchmark
> couvre désormais l'ensemble des modules cœur **et** la quasi-totalité des secondaires
> (175 issues, OPE-92→OPE-175). Les rares pistes restantes touchent des **décisions produit**
> (canal SMS payant) ou de l'**architecture transverse** (pagination des `*.list`, déjà
> commentée sur OPE-144) plutôt que des gaps de module nets. Recommandation : espacer le cron
> benchmark ou le re-cibler sur la **vérification d'implémentation** des tickets existants
> (« le modèle existe-t-il vraiment ? le calcul est-il correct ? ») plutôt que sur la découverte
> de nouveaux gaps, désormais marginale.

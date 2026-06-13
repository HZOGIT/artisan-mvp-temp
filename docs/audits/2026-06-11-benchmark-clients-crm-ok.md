# Benchmark — Clients / CRM (`clients`) vs Odoo `res.partner`/`crm` : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `clients` (`schema.ts`) + `clientsRouter` + portail client ↔ Odoo
> `res.partner` (`odoo-ref/odoo/addons/base/models/res_partner.py`) + `crm`.

---

## Conclusion : domaine **largement couvert** (5 tickets benchmark). Les écarts de valeur sont **déjà filés**. Le reste = B2B/ERP, hors MVP. Pas de nouveau ticket.

### Écarts à valeur — déjà tracés (anti-doublon)

| Concept Odoo `res.partner` / `crm` | Gap Operioz | Issue |
| -- | -- | -- |
| `company_type` (société/particulier), SIRET, TVA intracom (`l10n_fr`) | B2B non distingué, pas de SIRET/TVA client | **OPE-92** |
| Adresses multiples (`type` invoice/delivery) | une seule adresse | **OPE-93** |
| Étiquettes (`res.partner.category`) | pas de tags/segmentation | **OPE-120** |
| Activités planifiées (`mail.activity`) | suivi limité aux relances devis | **OPE-121** |
| Fusion de doublons (`base_partner_merge`) | aucune dédup/fusion | **OPE-130** |

→ les 5 axes CRM à fort ROI pour un artisan sont **couverts**.

### Écarts restants = B2B / ERP, hors périmètre MVP

- **Contacts multiples par client** (`res.partner.child_ids`) + **hiérarchie société**
  (`parent_id`) : pertinent pour un **syndic/entreprise** (gardien, comptable, directeur) —
  rare pour un artisan **majoritairement B2C** (1 client = 1 contact). Sur-ingénierie MVP.
- **Comptes bancaires du client** (`bank_ids`) + **mandats SEPA / prélèvement**
  (`sdd.mandate`) : utiles pour la collecte récurrente, mais **gated par OPE-6** (Stripe
  Connect / encaissement) et plus avancés que le MVP.
- **Pipeline d'opportunités** (`crm.lead`) : notre **devis** joue déjà le rôle d'opportunité
  (statut brouillon→envoyé→accepté/refusé). Un pipeline séparé serait redondant au MVP.

### Base solide

`clients` est **cloisonné** (CRUD via `dbSecure`, `ClientInputSchema` borné, portail
token-scopé — cf. audits). Suppression d'un client **gardée** côté facturation : déjà filé
**OPE-73** (intégrité des factures).

---

## Verdict

Le domaine **Clients / CRM** est **au niveau MVP** : les 5 améliorations à valeur
(B2B/SIRET, adresses, tags, activités, fusion) sont **déjà tracées** (OPE-92/93/120/121/130),
le modèle est cloisonné et borné. Les concepts Odoo restants (contacts multiples, hiérarchie
société, comptes bancaires/SEPA, pipeline CRM séparé) sont **B2B/ERP** ou **redondants**
(devis = opportunité) — hors périmètre artisan. **Aucun nouveau ticket benchmark.**

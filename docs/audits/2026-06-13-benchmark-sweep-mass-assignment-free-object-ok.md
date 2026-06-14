# Benchmark/QA — Sweep « entrées objet-libre → mass-assignment / incohérence » ✅ classe saine (2 issues connexes déjà tracées)

**Date** : 2026-06-13 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe mass-assignment) · **Domaine** : sécurité/intégrité des mutations à entrée libre

> Sweep de **toutes** les entrées `z.record(z.any())` / objet libre du routeur (suite à la finding <issue href="https://linear.app/operioz/issue/OPE-252">OPE-252</issue>). Risques : **mass-assignment** (écriture de colonnes arbitraires `id`/`artisanId`/état) et **incohérence de montants** (TVA/TTC ≠ HT). ↔ Odoo : champs `readonly`/`compute` + ACL par champ.

---

## ✅ Entrées objet-libre — toutes whitelistées

`grep "z.record(z.any())" / ": z.any()"` → **4 sites**, tous sains :

| Endpoint | Entrée libre | Garde | Verdict |
|---|---|---|---|
| `importClients` (`routers.ts:9294`) | `rows: z.array(z.record(z.string(), z.any())).max(5000)` | chaque champ extrait via **`pickField(row, mapping, "nom"/"email"/…)`** (liste fixe) → `createClient(artisan.id, {…})`. **Pas** de `...row` ; `artisanId` posé serveur | ✓ |
| `importDevis` (`:9352`) | idem | `pickField(...)` → `createDevis(artisan.id, {…})` | ✓ |
| `importFactures` (`:9419`) | idem | `pickField(...)` → `createFacture(artisan.id, {…})` | ✓ |
| `depenses.update` (`:9973`) | `data: z.record(z.any())` | whitelist **`DEPENSE_FIELD_MAP`** (`if (!col) continue`) ; `statut`/`rembourse`/`dateRemboursement` **exclus** (<issue href="https://linear.app/operioz/issue/OPE-63">OPE-63</issue>) ; recalcul TVA/TTC **inconditionnel** sur champ monétaire (<issue href="https://linear.app/operioz/issue/OPE-252">OPE-252</issue>, fixé) | ✓ |

→ **Aucun mass-assignment** : ni `id`/`artisan_id` ni colonnes arbitraires écrites depuis un objet client. Le `row` brut (colonnes arbitraires du fichier CSV) n'est lu que via `pickField` (extraction par mapping). Pattern correct pour un import (≈ Odoo `base_import` qui mappe colonne→champ).

## 🔗 Issues connexes (déjà tracées — pas de doublon)

- **Cohérence montants dépense** — <issue href="https://linear.app/operioz/issue/OPE-252">OPE-252</issue> : `depenses.update` pouvait persister un `montant_ttc` incohérent avec le HT → **corrigé** (recalcul inconditionnel, commit `718f37e`). Le `DEPENSE_FIELD_MAP` reste, mais TVA/TTC sont re-dérivés.
- **Totaux d'import facture/devis** — <issue href="https://linear.app/operioz/issue/OPE-78">OPE-78</issue> (HIGH, « Lancement 30 juin », **ouvert**) : `importFactures`/`importDevis` mappent **seulement `totalTTC`** (pas `totalHT`/`totalTVA`, ni ligne) → factures importées **incohérentes** (`HT+TVA ≠ TTC`, TVA=0) → CA/CA3 faussés + écritures déséquilibrées si générées. **Même classe** d'incohérence que OPE-250/OPE-252 mais **côté import**. Déjà filé (`docs/audits/2026-06-09-import-donnees-totaux-tva.md`) — **pas de re-ticket**.

## Odoo 19

`base_import` mappe explicitement colonne fichier → champ modèle (jamais d'objet brut écrit) ; les champs `compute`/`readonly` (montants de taxe) ne sont pas settables arbitrairement ; ACL `ir.model.access` + `groups` sur les champs sensibles. Operioz atteint l'équivalent via `pickField` (mapping) + whitelists DB + `artisanId` forcé serveur.

---

## Verdict

La classe « entrée objet-libre → mass-assignment » est **saine** : les 4 sites (3 imports + `depenses.update`) utilisent une extraction/whitelist par champ et forcent `artisanId` côté serveur — **aucune** écriture de colonne arbitraire. Les 2 défauts d'**incohérence de montants** de la même famille sont **déjà tracés** : OPE-252 (dépenses, **corrigé**) et OPE-78 (import factures/devis, **ouvert** dans « Lancement 30 juin »). **Aucun nouveau ticket** (pas de doublon).

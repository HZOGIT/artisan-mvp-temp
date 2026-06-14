# Benchmark — Sweep complet des générateurs PDF / e-facture : carte des résultats

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Synthèse de la passe de revue des **5 générateurs de documents** de
> `server/_core/pdfGenerator.ts` + `facturx.ts`, menée sur plusieurs firings. Objectif :
> conformité/fidélité des documents (devis, facture, avoir, contrat, BC, Factur-X).

---

## Carte des résultats

| Générateur | État | Suivi |
| -- | -- | -- |
| `generateDevisPDF` | 🐛 **« Conditions de paiement » + « valable 30 jours » codés en dur** (contredit la `dateValidite` réelle affichée) | **OPE-164** (étendu) |
| `generateFacturePDF` (facture) | 🐛 **« Paiement à 30 jours » codé en dur** (ignore `conditionsPaiement`/`dateEcheance`) + **mention escompte L441-9 absente** | **OPE-164** |
| `generateFacturePDF` (avoir) | 🐛 **titré « FACTURE »** au lieu de « Avoir », montants négatifs, sans rappel facture d'origine | **OPE-165** |
| `facturx.ts` (Factur-X XML) | 🐛 **`TypeCode` codé en dur 380** (faux pour avoir → 381) — couplé aux montants en valeur absolue | **OPE-19** (enrichi) |
| `generateContratPDF` | ✅ **propre** (lit les vrais champs : périodicité, reconduction, préavis, montants). Manque mention **Chatel** → ancrée dans **OPE-108** | OPE-108 |
| `generateBonCommandePDF` | ✅ **propre** (blocs artisan/fournisseur, lignes, **totaux calculés avec fallback**, délai/adresse de livraison réels) | — |

### Constats transverses

1. **Pattern « texte figé »** : les défauts devis/facture viennent de **mentions codées en
   dur** (conditions de paiement, validité) au lieu de lire les champs réels → **OPE-164**
   couvre les deux (même fichier, même fix).
2. **Pattern « avoir mal typé »** : un avoir est mal représenté sur **3 sorties** — FEC
   (**OPE-136**, corrigé), PDF (**OPE-165**), Factur-X (**OPE-19**). Même correction
   conceptuelle : **typer l'avoir** + **montants en valeur absolue**.
3. **Générateurs propres** : contrat et bon de commande lisent fidèlement les données
   (bonne base) ; le pied **mentions légales** des factures (pénalités + 40 € L441-10) est
   **déjà présent** (OPE-95, signalé implémenté).

---

## Verdict

La **couche document** est **entièrement auditée**. Les défauts sont **tous tracés** (OPE-164
mentions devis/facture, OPE-165 PDF avoir, OPE-19 Factur-X TypeCode, OPE-108 mention Chatel
contrat). Les générateurs **contrat** et **bon de commande** sont **propres**. Le FEC est
servi par le générateur conforme partout (cf. `fec-generateur-actif-ok`). **Aucun nouveau
ticket** : tout est consolidé dans des issues existantes (anti-doublon). Plus besoin de
re-réviser les générateurs PDF dans les prochains firings.

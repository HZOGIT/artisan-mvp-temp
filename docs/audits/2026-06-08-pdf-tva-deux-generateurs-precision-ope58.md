# Audit — OPE-58 (TVA PDF taux unique) : précision « deux générateurs » + repro corrigée

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Complète **OPE-58**. Découverte en session : il existe **deux** générateurs PDF,
> et le bug ne se manifeste **que** sur les PDF générés **serveur** (ceux remis au
> client), pas sur le bouton « Export PDF » de l'artisan.

---

## Deux générateurs distincts

| Générateur | Calcul TVA | Utilisé par |
| -- | -- | -- |
| **`client/src/lib/pdfGenerator.ts`** | imprime les **totaux stockés** `devis.totalTVA`/`totalTTC` (`addTotals`, `:549`/`:587`) → **par ligne, CORRECT** | **bouton « Export PDF »** in-app (DevisDetail `:255`, FactureDetail `:312`) |
| **`server/_core/pdfGenerator.ts`** | `tva = sousTotal × artisan.tauxTVA` (`:478`/`:558`) → **taux unique, FAUX** | tout ce qui part **vers le client** |

Chemins serveur (buggés) :
- `GET /api/portail/:token/devis/:id/pdf` (`index.ts:394`) et `.../factures/:id/pdf`
  (`:420`) → **téléchargement portail client**
- `devis.sendByEmail` / `factures.sendByEmail` (`routers.ts:883`/`1502`) → **PDF
  joint à l'email envoyé au client**
- Factur-X / export-pdf-lot (`index.ts:645`/`747`), PDF assistant
  (`assistantTools.ts:826`/`1013`)

→ **L'artisan ne voit jamais le bug** (son « Export PDF » = générateur client,
correct). Seul le **document légal remis au client** (email + portail) est faux.
C'est un défaut **furtif** (divergence invisible côté émetteur).

## Reproduction (corrigée)

Source de vérité stockée = somme par ligne (`recalculateFactureTotals`, `db.ts`).

1. Devis/facture : 1000 € HT **@10 %** + 1000 € HT **@20 %** (le taux par ligne est
   saisissable : `DevisLigneEdit.tsx:534`).
2. In-app + « Export PDF » → **2300 € TTC** (TVA 300) ✅
3. Portail client `GET /api/portail/<token>/factures/<id>/pdf` **ou** email avec PDF
   joint → **2400 € TTC** (TVA 400) ❌

Divergence : +100 € sur ce cas (généralisable à tout écart `ligne.tauxTVA` ≠
`artisan.tauxTVA` ; inclut la franchise 0 % et les taux 5,5/10 %).

## Conséquence pour le fix

Le correctif d'OPE-58 doit viser le **générateur serveur** et, le plus sûr,
**l'aligner sur le client** : imprimer `totalHT`/`totalTVA`/`totalTTC` **stockés**
+ une **ventilation par taux** (regrouper les lignes par `tauxTVA`), au lieu de
recalculer `sousTotal × artisan.tauxTVA`. Idéalement, factoriser un seul calcul
partagé pour éviter que les deux générateurs redivergent.

→ **OPE-58 étendu par commentaire** (pas de nouvelle issue).

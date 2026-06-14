# Audit — Lignes devis/facture : validation quantité/prix (négatif / NaN) — MEDIUM (OK)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `factures.addLigne` (`routers.ts:1407`) & `devis.addLigne` — input
> `quantite`/`prixUnitaireHT`. Lié au thème montants (OPE-58/53).

---

## Constat — aucune validation numérique/positivité sur les montants de ligne

```typescript
// addLigne (facture & devis) — input
quantite: z.string().default("1"),     // ← string libre, pas de min/numeric
prixUnitaireHT: z.string(),            // ← string libre
// handler
const quantite = parseFloat(input.quantite);
const prixUnitaireHT = parseFloat(input.prixUnitaireHT);
const montantHT = quantite * prixUnitaireHT;   // peut être négatif ou NaN
```

### Risque 1 — total facture négatif (devrait être un avoir)

Une quantité ou un prix **négatif** → `montantHT` négatif → `recalculateFacture
Totals` peut produire un **`totalTTC` négatif**. Or une **facture à total négatif
est non conforme** (CGI : une correction/remboursement se fait par **avoir** —
flux `createAvoir` qui existe déjà et est robuste). **Nuance** : des lignes
négatives sont **légitimes** pour une **remise** tant que le **total reste ≥ 0**.

### Risque 2 — NaN (input non numérique)

`prixUnitaireHT` n'a **pas de défaut** et accepte `""`/`"abc"` → `parseFloat` =
**NaN** → `montantHT = NaN` → `.toFixed(2) = "NaN"`. En colonne `decimal` : MySQL
**strict** rejette (addLigne 500) ; non-strict stocke 0/corrompt. Si un `"NaN"`
passait, il **empoisonnerait le total** de la facture (et la somme CA du dashboard).
Atténué par le mode SQL strict (rejet à l'insert) et l'UI qui envoie des nombres.

### Sévérité

**MEDIUM** : exige un input **délibérément négatif** (self-inflicted) ou
**malformé** (hors UI), et MySQL strict bloque le NaN. Pas un crash/blocage du cas
nominal → documenté, pas d'issue.

---

## Recommandation (à intégrer au lot « montants » OPE-58)

1. **Valider numérique** : `z.string().refine(v => !isNaN(parseFloat(v)), "Valeur
   numérique requise")` sur `quantite`/`prixUnitaireHT` (rejette NaN), + défaut/
   requis sur `prixUnitaireHT`.
2. **Garder le total ≥ 0** : après `recalculateFactureTotals`, refuser un
   `totalTTC < 0` (« Pour un remboursement, émettez un avoir »). Autoriser les
   lignes de **remise** négatives tant que le total reste positif.
3. Idem côté **client** (DevisLigneEdit/DevisNouveau) pour le feedback immédiat.

---

## Verdict

Validation de ligne **laxiste** (string libre → négatif/NaN possibles), mais
impact **MEDIUM** (input délibéré/malformé requis, MySQL strict bloque le NaN, les
lignes négatives sont légitimes en remise). Reco : valider numérique + garder le
**total facture ≥ 0** (à folder dans OPE-58). **Pas d'issue Linear.**

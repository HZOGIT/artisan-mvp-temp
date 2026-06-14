# Audit — PDF devis/facture : TVA calculée à un taux unique (ignore les taux par ligne)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `server/_core/pdfGenerator.ts` — calcul des totaux TVA sur les PDF
> devis/facture/contrat. Distinct d'OPE-19/20/21/56 (autres mentions/format).

---

## 🟠 HIGH — Le PDF recalcule la TVA à un taux UNIQUE (taux par défaut de l'artisan), en ignorant les taux par ligne

### Problème

Le générateur PDF calcule le sous-total depuis les lignes, puis applique le
**taux de TVA par défaut de l'artisan** à l'ensemble, **sans tenir compte du
`tauxTVA`/`montantTVA` de chaque ligne** :

```typescript
// pdfGenerator.ts:471-479 (devis) — identique facture (:557-559), contrat (:682-684)
const sousTotal = devis.lignes.reduce((s, l) => s + Number(l.prixUnitaireHT) * Number(l.quantite), 0);
const tauxTVA = Number(artisan.tauxTVA) || 20;     // ← taux UNIQUE (profil artisan)
const tva = sousTotal * (tauxTVA / 100);           // ← appliqué à TOUT le sous-total
const totalTTC = sousTotal + tva;
// affiché : « TVA (20%) » + TOTAL TTC
```

Or chaque ligne porte son propre `tauxTVA` (et `montantTVA` correct, calculé par
`recalculateFactureTotals`). Le PDF **jette** cette ventilation.

### Conséquences

1. **Taux réduit faux** : pour le bâtiment, le **taux 10 %** (rénovation de
   logement de + de 2 ans) — voire 5,5 % — est **très courant**. Si les lignes
   sont à 10 % mais le profil artisan à 20 % (défaut), le PDF affiche **20 %** →
   **TVA et TTC surévalués sur le document légal**.
2. **PDF ≠ montant facturé** : le `facture.totalTTC` **stocké** (calculé par ligne,
   correct) — et **encaissé par Stripe** — peut **différer du TTC affiché sur le
   PDF**. Le client voit un montant sur la facture et est débité d'un autre.
3. **Pas de ventilation TVA par taux** : en cas de **taux mixtes** (ex. 10 % + 20 %
   sur le même devis), la loi impose un **récapitulatif de TVA par taux**. Le PDF
   n'affiche qu'une seule ligne « TVA (X%) ».

> Ironie : la couche de données est correcte (cf. audit calcul-montants : TVA par
> ligne via `recalculateFactureTotals`). C'est **le PDF qui n'utilise pas ces
> données correctes** et recalcule à un taux unique.

### Fix proposé

1. **Utiliser les montants par ligne** (ou les totaux stockés) au lieu de
   recalculer :
   ```typescript
   const tvaParTaux = new Map<number, number>();         // taux -> somme montantTVA
   for (const l of devis.lignes) {
     const t = Number(l.tauxTVA) || 20;
     const ht = Number(l.prixUnitaireHT) * Number(l.quantite);
     tvaParTaux.set(t, (tvaParTaux.get(t) || 0) + ht * t / 100);
   }
   const tva = [...tvaParTaux.values()].reduce((a,b)=>a+b, 0);
   const totalTTC = sousTotal + tva;
   ```
   (ou simplement `tva = devis.totalTVA` / `facture.totalTVA` déjà stocké).
2. **Afficher la ventilation** : une ligne « TVA (taux %) » **par taux présent**
   quand `tvaParTaux.size > 1`.

### Estimation

~0,5 j — calcul TVA par ligne + ventilation multi-taux sur devis/facture/contrat
+ test (facture 10 % → PDF 10 %, facture mixte → ventilation, PDF == `totalTTC`).

---

## Estimation totale

- HIGH (PDF TVA taux unique / ≠ montant facturé / pas de ventilation) : ~0,5 j

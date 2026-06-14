# Audit — Facture : mentions légales pénalités de retard / indemnité 40 € (B2B) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : footer légal du PDF de facture (`pdfGenerator.ts:600-613`).

---

## Conclusion : mentions B2B de retard de paiement présentes et inconditionnelles. Pas de BLOCKER/HIGH.

Entre professionnels, l'**art. L441-10 C. com.** impose sur la facture : le **taux des
pénalités de retard** **et** l'**indemnité forfaitaire de 40 €** pour frais de recouvrement.
Leur absence = sanction. Vérifié — **présentes**.

### Mentions rendues (toujours, sans condition)

```typescript
// pdfGenerator.ts:603-613 — footer, AUCUN if autour
doc.text("Paiement à 30 jours.", …);
doc.text("En cas de retard de paiement, une pénalité de 3 fois le taux d'intérêt légal sera appliquée,", …);
doc.text("ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (Art. L441-10 C. com.).", …);
```

- **Pénalité de retard** : « 3 fois le taux d'intérêt légal » = le **défaut légal**
  applicable à défaut de taux contractuel → mention valide.
- **Indemnité forfaitaire 40 €** + **référence L441-10** : présentes.
- **Inconditionnelles** : rendues dans le footer de **chaque** facture (pas derrière un
  `if` qui pourrait les omettre).

---

## Réserve LOW

- **Incohérence de délai** : le footer dit « Paiement à 30 jours » (`:603`) alors qu'une
  autre ligne dit « Conditions de paiement : à réception de la facture » (`:498`). Les deux
  apparaissent → message contradictoire (l'`dateEcheance` réelle est +30 j). Cosmétique,
  à harmoniser. LOW.

### Écarts de mentions = déjà filés (autres mentions)

- Médiateur de la consommation (B2C), SIRET non garanti, assurance décennale → **déjà
  filés** (mentions B2C / SIRET / décennale). Orthogonaux à la mention **retard B2B**
  auditée ici (qui, elle, est **présente**).

---

## Verdict

Les mentions B2B obligatoires de **retard de paiement** (pénalité + **indemnité 40 €** +
**L441-10**) sont **présentes et inconditionnelles** sur le PDF de facture. Réserve = LOW
(incohérence « à réception » vs « 30 jours »). Les autres mentions manquantes sont **déjà
filées**. **Pas de nouvelle issue Linear.**

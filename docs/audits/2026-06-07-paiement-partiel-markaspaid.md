# Audit — Paiement partiel : `markAsPaid` marque toujours « payée »

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `factures.markAsPaid` (`routers.ts:1454`) et la gestion des
> paiements partiels (acomptes). Distinct d'OPE-53 (CA en TTC).

---

## Ce qui fonctionne correctement

- Ownership vérifié (`facture.artisanId !== artisan.id` ⇒ FORBIDDEN). ✓
- Audit log du paiement. ✓

---

## 🟠 HIGH — Un paiement partiel (acompte) marque la facture « entièrement payée »

### Problème

`markAsPaid` enregistre le montant payé et force **`statut: "payee"`** **sans
comparer `montantPaye` au `totalTTC`** :

```typescript
// routers.ts:1469-1473
const result = await db.updateFacture(input.id, {
  montantPaye: input.montantPaye,         // ← écrase (n'accumule pas)
  datePaiement: new Date(input.datePaiement),
  statut: "payee",                        // ← TOUJOURS « payée », même partiel
});
```

Le schéma `factures.statut` (`["brouillon","validee","envoyee","payee",
"en_retard","annulee"]`) **n'a pas de statut « partiellement payée »** : le
système n'a aucune notion de paiement partiel.

### Impact (acompte = cas très courant dans le bâtiment)

Un artisan encaisse un **acompte de 30 %** (standard à la signature) sur une
facture de 1 000 € → `markAsPaid({ montantPaye: "300" })` →
**statut = « payee »**. Conséquences :

1. **Créance perdue de vue** : le dashboard « factures impayées »
   (`getDashboardStats` : `WHERE statut NOT IN ('payee','annulee','brouillon')`)
   **exclut** la facture → l'artisan **ne voit plus** les 700 € restant dus → pas
   de relance → perte de trésorerie.
2. **CA faussé** : le CA encaissé compte le **`totalTTC` complet** (1 000 €) pour
   les factures `payee` (cf. OPE-53), alors que **seuls 300 € ont été reçus**.
3. **`montantPaye` écrase** au lieu d'accumuler : un 2ᵉ versement remplace le 1ᵉʳ
   (300 puis 700 → `montantPaye = 700`, jamais 1 000).

### Fix proposé

1. Ajouter un statut **`partiellement_payee`** à l'enum.
2. Dans `markAsPaid` : **accumuler** le montant et **dériver le statut** :
   ```typescript
   const dejaPaye = parseFloat(facture.montantPaye || '0');
   const nouveauTotalPaye = dejaPaye + parseFloat(input.montantPaye);
   const ttc = parseFloat(facture.totalTTC || '0');
   const statut = nouveauTotalPaye >= ttc - 0.01 ? 'payee'
                : nouveauTotalPaye > 0 ? 'partiellement_payee'
                : facture.statut;
   if (nouveauTotalPaye > ttc + 0.01) throw BAD_REQUEST("Le montant dépasse le solde dû");
   ```
3. Adapter le dashboard (impayées = solde restant) et le CA (compter le **montant
   réellement encaissé**, pas le `totalTTC`, pour les paiements partiels — à
   coordonner avec OPE-53).

### Estimation

~0,5 j — statut partiel + accumulation + dérivation + garde sur-paiement + MAJ
dashboard/CA + test (acompte → partiellement_payee, solde dû visible).

---

## Estimation totale

- HIGH (paiement partiel marqué « payée ») : ~0,5 j

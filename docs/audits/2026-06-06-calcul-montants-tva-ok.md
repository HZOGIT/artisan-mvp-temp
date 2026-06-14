# Audit — Calcul & intégrité des montants (HT / TVA / TTC) — RAS bloquant

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : calcul des montants de lignes et totaux devis/factures, arrondis
> TVA, et **intégrité serveur** (le serveur fait-il confiance aux montants
> envoyés par le client ?). **Aucun BLOCKER ni HIGH** → pas d'issue Linear.

---

## Ce qui a été vérifié et est correct

### Montants de ligne calculés côté serveur
`factures.addLigne` (`routers.ts:1428-1447`) et l'équivalent devis recalculent
**toujours** les montants à partir de `quantité` × `prixUnitaireHT` et `tauxTVA` —
ils ne stockent jamais un montant fourni par le client :
```typescript
const montantHT  = quantite * prixUnitaireHT;
const montantTVA = montantHT * (tauxTVA / 100);
const montantTTC = montantHT + montantTVA;   // puis .toFixed(2) sur chacun
```

### Totaux recalculés côté serveur (round-then-sum)
`recalculateFactureTotals` (`db.ts:751`) et `recalculateDevisTotals` (`db.ts:544`)
somment les montants **par ligne déjà arrondis**, puis `totalTTC = totalHT +
totalTVA`. Méthode « arrondi par ligne » → légalement acceptable et **cohérente**
(`totalTTC` toujours = `totalHT` + `totalTVA`). Appelées après chaque
add/update/delete de ligne (`routers.ts:732, 1450, …`).

### Le serveur ne fait pas confiance aux totaux du client
- `factures.create` (`routers.ts:1263`) initialise les totaux à `0.00` ; ils ne
  proviennent jamais de l'input.
- `factures.update` (`routers.ts:1304`) destructure un ensemble de champs **fixe**
  (`id, dateEcheance, datePaiement, statut, montantPaye…`) — `totalHT/TVA/TTC`
  **ne font pas partie** des champs modifiables, donc non injectables.
- Les schémas `FactureInputSchema` / `DevisInputSchema` (qui, eux, acceptent des
  totaux client) sont **importés mais jamais branchés** sur une route
  (`grep` → seule la ligne d'import `routers.ts:14`). Pas de chemin vif qui
  stocke des totaux client.

### Verrouillage fiscal
Ajout/suppression de ligne refusé si la facture n'est pas `brouillon`
(`routers.ts:1425`) → les montants d'un document émis sont figés.

### Cohérence paiement
Stripe encaisse `facture.totalTTC` (valeur recalculée serveur), pas un montant
fourni par le client.

---

## Points mineurs relevés (sévérité < HIGH — pas d'issue)

1. **Arrondi `toFixed(2)`** : `Number.prototype.toFixed` souffre du biais de
   représentation flottante (`1.005.toFixed(2) → "1.00"`). Sur certaines valeurs
   de TVA, écart possible de 1 centime. Acceptable, mais un helper d'arrondi
   décimal (ou `Math.round(x*100)/100` avec epsilon) serait plus robuste.

2. **Import historique** (`routers.ts:8001`, import Excel de factures passées) :
   `totalTTC` est repris **tel quel** du fichier importé, sans recalcul. C'est le
   comportement attendu pour une migration de données existantes, mais cela peut
   introduire des factures importées dont les totaux ne correspondent pas à des
   lignes (puisqu'il n'y a pas de lignes importées). À garder en tête, non bloquant.

3. **Schémas morts** `FactureInputSchema` / `DevisInputSchema` (avec totaux
   client) : à supprimer pour éviter qu'un futur dev les branche par erreur sur
   une route et fasse confiance aux totaux du client.

---

## Conclusion

La chaîne de calcul des montants HT/TVA/TTC est **fiable et calculée côté
serveur** ; aucun chemin ne fait confiance à des totaux envoyés par le client.
Aucun BLOCKER/HIGH. Seuls des durcissements mineurs (arrondi robuste, nettoyage
des schémas morts) sont suggérés.

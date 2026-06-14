# Audit — Prévisions de CA / objectifs

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `previsionsRouter` (`routers.ts:5914`), `calculerPrevisionsCA` /
> `calculerHistoriqueCAMensuel` (`db.ts`). **Pas de nouvelle issue** : la part
> « CA en TTC » relève d'OPE-53 (étendue par commentaire) ; le reste est MEDIUM.

---

## Ce qui fonctionne correctement

- **Données présentes** (contrairement à OPE-52) : `calculerHistoriqueCAMensuel`
  est **recalculé automatiquement** avant la prévision (`routers.ts:5924,5955`) →
  l'historique n'est pas vide.
- Scopé `WHERE artisanId = ?` (pas d'IDOR).

---

## Part relevant d'OPE-53 — l'historique de CA est en TTC

`calculerHistoriqueCAMensuel` (`db.ts:~2719`) somme `f.totalTTC` (factures
`statut = 'payee'`) → le CA mensuel historique est en **TTC**, donc les prévisions
**héritent de la surévaluation ~20 %** (cf. OPE-53). OPE-53 ne listait pas cette
fonction → **OPE-53 étendue** par commentaire pour l'inclure.

---

## 🟡 MEDIUM (documenté, pas d'issue) — méthodes de prévision naïves / mal nommées

`calculerPrevisionsCA` expose 3 méthodes (`methode: enum`), mais 2 ne font pas ce
que leur nom indique :

```typescript
// db.ts calculerPrevisionsCA
case 'regression_lineaire':
  caPrevisionnel = overallAvg * (1 + 0.02 * (mois / 12));   // ← PAS une régression
case default /* moyenne_mobile */:
  caPrevisionnel = overallAvg;                              // ← PAS une moyenne mobile
case 'saisonnalite':
  caPrevisionnel = moyenne du mois calendaire;              // ← OK (raisonnable)
```

- **`regression_lineaire`** : aucune régression sur la série temporelle —
  simplement la moyenne globale × un facteur de croissance fixe (+2 % max sur
  l'année).
- **`moyenne_mobile`** : renvoie la **moyenne globale**, pas une moyenne mobile
  (qui pondérerait les mois récents).

→ L'utilisateur qui choisit « régression linéaire » ou « moyenne mobile » obtient
un résultat qui **ne correspond pas à la méthode annoncée**. Les prévisions
restent « directionnelles » mais les libellés sont **trompeurs**. Impact faible
(feature informationnelle) → MEDIUM. **Fix** : implémenter réellement les méthodes
ou renommer en « tendance » / « moyenne » honnêtes.

---

## Conclusion

Prévisions **fonctionnelles** (données présentes, scopées). Deux réserves :
(1) CA historique en TTC → surévaluation héritée d'**OPE-53** (étendue) ;
(2) méthodes de prévision naïves/mal nommées (MEDIUM, à renommer ou implémenter).
Pas de nouveau BLOCKER/HIGH.

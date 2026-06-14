# Audit — Congés : calcul du solde à l'approbation (idempotence, décompte) — MEDIUM-LOW

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `conges.approuver` (`routers.ts:5857-5876`), `updateSoldeConges`
> (`db.ts`). Feature **RH secondaire** (gestion des congés techniciens).

---

## Conclusion : pas de solde négatif, mais idempotence absente. Pas de BLOCKER/HIGH.

### ✅ Le solde ne peut pas devenir négatif

```sql
-- updateSoldeConges (db.ts)
SET joursPris = joursPris + ?,
    soldeRestant = GREATEST(0, soldeRestant - ?)   -- clamp à 0
```

→ Approuver plus de jours que disponibles **plafonne** `soldeRestant` à 0 (pas de négatif).

### 🟡 MEDIUM-LOW — pas d'idempotence : double-approbation = double-décompte

`approuver` (`:5857`) ne vérifie **pas** si le congé est **déjà** `approuve` avant
d'appeler `updateSoldeConges`. Or `updateSoldeConges` est **additif**
(`joursPris + delta`, `soldeRestant - delta`). Donc **ré-approuver** le même congé
**re-décompte** le solde (et re-incrémente `joursPris`) → solde **faussé**. Double-clic /
re-jeu = perte de jours de congé pour le salarié.

**Fix** : garde d'idempotence — `if (conge.statut === 'approuve') return;` avant le
décompte (et symétriquement, `annuler` d'un congé approuvé devrait **recréditer** le
solde, à vérifier).

### 🟡 LOW — `jours` compte les week-ends

`jours = Math.ceil(diff/86400000) + 1` (`:5866`), ajusté des demi-journées, **n'exclut ni
les week-ends ni les jours fériés** → un congé du vendredi au lundi décompte **4 jours**
(au lieu de 2 ouvrés selon la politique). Nuance RH, à confirmer côté produit.

### Écart connu = déjà filé

- `approuver` est `protectedProcedure` sans `conge.artisanId === artisan.id` → **IDOR**
  d'approbation/décompte cross-tenant = **déjà filé** (congés IDOR). Pas de doublon.

---

## Verdict

Le décompte de congés **plafonne à 0** (pas de négatif) mais **manque d'idempotence**
(ré-approbation → double-décompte) et **compte les week-ends**. Impacts =
**données RH d'une feature secondaire** (MEDIUM-LOW), pas financier/sécurité ; l'IDOR
d'accès est **déjà filé**. **Pas de nouvelle issue Linear** ; garde d'idempotence simple à
ajouter.

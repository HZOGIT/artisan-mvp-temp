# Audit — Congés : annulation/suppression ne recréditent pas le solde (complément) — MEDIUM-LOW

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `conges.annuler` (`routers.ts:5884`), `conges.delete` (`:5890`) ; complète
> `2026-06-10-conges-approbation-solde-idempotence.md`.

---

## Constat : le solde n'est jamais recrédité à l'annulation/suppression

Mon audit précédent notait que `approuver` **décompte** le solde (et le **double-décompte**
à la ré-approbation, faute d'idempotence) et flaggait « *annuler devrait recréditer, à
vérifier* ». **Vérifié → non recrédité** :

```typescript
// conges.annuler (:5884) — change SEULEMENT le statut
return await db.updateCongeStatut(input.id, 'annule', ctx.user.id);

// conges.delete (:5890) — supprime SANS toucher au solde
await db.deleteConge(input.id);
```

→ Annuler/supprimer un congé **approuvé** (qui avait décompté le solde via `approuver`) **ne
restaure pas** les jours → l'employé les **perd définitivement**.

### Bilan : solde de congés mal maintenu **dans les deux sens**

| Transition | Effet sur le solde | Correct ? |
| -- | -- | -- |
| `approuver` (1ʳᵉ fois) | `joursPris += N`, `soldeRestant -= N` | ✅ |
| `approuver` (ré-appel) | re-décompte (pas d'idempotence) | ❌ (déjà documenté) |
| `annuler` / `delete` d'un approuvé | **rien** (pas de recrédit) | ❌ **(ce constat)** |

### Cadrage

- Impact = **données RH d'une feature secondaire** (solde de congés faux) — pas
  financier/sécurité. **MEDIUM-LOW**, sous le seuil BLOCKER/HIGH (même verdict que l'audit
  d'idempotence d'approbation).
- **IDOR** sur `delete`/`getSoldes`/`initSolde` (handlers sans scope `artisanId`) =
  **déjà filé OPE-45** (congés : approbation/refus/suppression + soldes sans ownership).
  Pas de doublon.

---

## Fix proposé (cohérent avec le précédent)

- `annuler`/`delete` d'un congé **approuvé** (`conge_paye`/`rtt`) → **recréditer** le solde
  (`updateSoldeConges(..., -N)` ou décrément de `joursPris`).
- Combiner avec la **garde d'idempotence** sur `approuver` (un seul décompte par congé) →
  source de vérité cohérente. Idéalement, recalculer le solde depuis l'ensemble des congés
  `approuve` plutôt que des deltas (évite la dérive).

---

## Verdict

`annuler`/`delete` **ne recréditent pas** le solde → perte de jours à l'annulation d'un
congé approuvé. Avec le **double-décompte** à la ré-approbation, le solde de congés est
**mal maintenu dans les deux sens** → **MEDIUM-LOW** (RH, feature secondaire). IDOR
associé **déjà filé (OPE-45)**. **Pas de nouvelle issue Linear** ; fix = recréditer +
idempotence (ou recalcul depuis les congés approuvés).

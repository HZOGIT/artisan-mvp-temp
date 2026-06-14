# Audit — Suppression de facture : cycle de vie **conforme** (immutabilité + tenant + cascade + audit). Aucun BLOCKER.

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin
**Domaine audité** : suppression des documents fiscaux (factures) — conformité FR + intégrité.

---

## Conclusion : la suppression de facture est **bien protégée**. Aucune issue.

### ✅ Immutabilité fiscale (FR) : seuls les brouillons sont supprimables

`factures.delete` (`server/routers.ts:1519`, `facturesSupprimerProcedure`) :
```ts
if (facture.statut !== "brouillon")
  throw FORBIDDEN("Un document fiscal validé ne peut pas être supprimé. Émettez un avoir…");
```
→ Une facture **validée/envoyée/payée/en_retard** **ne peut pas être supprimée** (conforme :
une facture émise est immuable, correction par **avoir** uniquement). Cohérent avec
l'immutabilité **en update** (déjà vérifiée — verrou `isLocked` + machine à états).

### ✅ Isolation multi-tenant

Ownership vérifié **avant** suppression : `dbSecure.getFactureByIdSecure(input.id, artisan.id)`
(`:1526`) → NOT_FOUND si la facture n'appartient pas à l'appelant. La fonction DB
`deleteFacture(id)` (`db.ts:702`) n'est appelée qu'après ce contrôle (pattern router-gated
standard, cf. sweeps IDOR).

### ✅ Cascade propre (pas d'orphelins)

`deleteFacture` (`db.ts:702-705`) supprime **d'abord les lignes** puis la facture :
```ts
await db.delete(facturesLignes).where(eq(facturesLignes.factureId, id));
await db.delete(factures).where(eq(factures.id, id));
```
→ pas de `factures_lignes` orphelines. Et comme seuls les **brouillons** sont supprimables, il
n'y a pas d'`ecritures_comptables` à orpheliner (générées à la validation).

### ✅ Traçabilité

`createAuditLog({ action: "suppression_brouillon", … })` (`:1530`) journalise la suppression.

---

## Verdict

Le **cycle de suppression d'une facture** respecte l'**immutabilité fiscale** (brouillon
uniquement → sinon avoir), est **tenant-scopé**, **cascade** sans orphelin, et **audité**.
**Aucun BLOCKER/HIGH.** Pas d'issue.

> Note : la suppressibilité d'un **devis** signé/accepté relève d'un périmètre distinct,
> **déjà filé (OPE-50)**. Stripe Connect (OPE-6) non ré-audité. Le `deleteFacture(id)` prend un
> `id` seul mais est correctement **gardé au niveau routeur** (ownership + statut) — conforme au
> pattern du reste du codebase.

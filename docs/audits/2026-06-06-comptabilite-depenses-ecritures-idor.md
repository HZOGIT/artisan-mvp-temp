# Audit — Comptabilité achats / dépenses / écritures

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : `depensesRouter` (`routers.ts:8383`), génération d'écritures
> comptables, rapport/déclaration TVA. Distinct de l'export FEC (OPE-33).

---

## Ce qui fonctionne correctement

- **Dépenses** : `getById` / `update` / `delete` passent tous `artisan.id` au
  helper (`getDepenseById(id, artisanId)`, `updateDepense(id, artisanId, …)`,
  `deleteDepense(id, artisanId)`) → scope correct, pas d'IDOR. ✓
- **`updateDepense`** : malgré une entrée `data: z.record(z.any())`, le helper
  **filtre les colonnes via une whitelist** `DEPENSE_FIELD_MAP` (`if (!col)
  continue`) et **recalcule `montant_tva`/`montant_ttc`** si `montantHt`/`tauxTva`
  changent → pas de mass-assignment, montants cohérents. ✓
- **`create`** calcule `montantTva`/`montantTtc` côté serveur. ✓
- **TVA** : `getRapportTVA` / `getDeclarationTVA` scopés sur `artisan.id`. ✓

---

## 🟠 HIGH — IDOR : `genererEcrituresFacture` ne vérifie pas l'appartenance de la facture (écrasement d'écritures cross-tenant)

### Problème

`comptabilite.genererEcrituresFacture` (`routers.ts:5429`) prend un `factureId`
et appelle directement la fonction DB **sans aucune vérification d'ownership**
(le handler ne destructure même pas `ctx`) :

```typescript
// routers.ts:5429
genererEcrituresFacture: comptaVoirProcedure
  .input(z.object({ factureId: z.number() }))
  .mutation(async ({ input }) => {
    return await db.genererEcrituresFacture(input.factureId);   // ← factureId non vérifié
  }),
```

Et la fonction DB lit **n'importe quelle facture**, **supprime** ses écritures
existantes, puis les **réinsère** avec l'`artisanId` de la facture (= la victime) :

```typescript
// db.ts — genererEcrituresFacture(factureId)
const [facture] = await db.select().from(factures).where(eq(factures.id, factureId)).limit(1);
// ...
await db.delete(ecrituresComptables).where(eq(ecrituresComptables.factureId, factureId)); // ← DELETE
// ... réinsère { artisanId: facture.artisanId, ... }
```

`comptaVoirProcedure` n'exige que la permission `comptabilite.voir` — que **tout
artisan propriétaire** possède. Aucun lien entre la facture ciblée et l'artisan
appelant n'est vérifié.

### Exploitation

Un artisan authentifié itère `factureId = 1..N` :
- **Supprime puis régénère les écritures comptables** d'autres artisans
  (`DELETE FROM ecritures_comptables WHERE factureId = ?`). Si la victime avait
  des écritures ajustées manuellement, elles sont **écrasées**.
- Tampering massif des livres comptables d'autres tenants (intégrité comptable
  d'autrui altérée par un tiers).

C'est une **écriture cross-tenant** (mutation), même si la fonction ne renvoie
pas les données de la facture (`{ success, nombreEcritures }`).

### Lien avec les autres issues

Distinct d'OPE-17 (routes sans **guard de rôle**) : ici le guard de permission
*existe* (`comptaVoirProcedure`) mais le contrôle d'**appartenance** manque.
Distinct d'OPE-9/10/30/31 (autres entités).

### Fix proposé

Vérifier l'appartenance avant génération :

```typescript
genererEcrituresFacture: comptaVoirProcedure
  .input(z.object({ factureId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND" });
    const facture = await db.getFactureById(input.factureId);
    if (!facture || facture.artisanId !== artisan.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Facture introuvable" });
    }
    return await db.genererEcrituresFacture(input.factureId);
  }),
```

(et/ou passer `artisanId` à la fonction DB et filtrer le `WHERE`.)

### Estimation

~30 min — check d'ownership + test cross-tenant.

---

## Point secondaire (documenté, < HIGH)

**Incohérence du compte de vente** entre les générateurs d'écritures :
`genererEcrituresFacture` (`db.ts`) crédite **706000 (Prestations de services)**,
alors que la route FEC (`index.ts:583`) et `getJournalVentes` utilisent
**701000 (Ventes de produits finis)**. Pour un artisan (services), **706** est le
bon compte ; 701 (marchandises) est discutable. À harmoniser — lié à OPE-33 (FEC).

---

## Estimation totale

- HIGH (IDOR genererEcrituresFacture) : ~30 min

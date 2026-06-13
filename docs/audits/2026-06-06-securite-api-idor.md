# Audit — Sécurité API / IDOR (Insecure Direct Object Reference)

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

---

## Contexte

L'app est un SaaS multi-tenant : plusieurs artisans coexistent sur la même instance,
chacun ne devant voir/modifier que ses propres données. Les endpoints tRPC utilisent
un pattern `dbSecure.*` pour les opérations principales, mais plusieurs mutations
ne vérifient pas que la **sous-ressource** (ligne de devis, ligne d'option, rapport)
appartient bien à l'artisan authentifié.

---

## 🔴 BLOCKER 1 — IDOR sur `devis.deleteLigne` et `devis.updateLigne`

### Problème

Les mutations `deleteLigne` et `updateLigne` vérifient l'ownership du **devis parent**
(`input.devisId`) mais appellent ensuite les fonctions DB avec `input.id` (l'ID de la
ligne) **sans vérifier que cette ligne appartient à ce devis**.

### Scénario d'exploitation

1. Artisan B possède le devis #99. Artisan A possède la ligne #5 (sur son devis #1).
2. Artisan B appelle `devis.deleteLigne({ id: 5, devisId: 99 })`.
3. Le check passe (devis #99 appartient à B ✓), puis `deleteLigneDevis(5)` supprime
   la ligne #5 d'Artisan A.

### Preuve

- `server/routers.ts:787-791` — `devisOwned.artisanId !== artisan.id` → OK, puis
  `db.deleteLigneDevis(input.id)` sans aucune vérification que `input.id` ∈ `input.devisId`.
- `server/routers.ts:749-777` — même pattern sur `updateLigne`.
- `server/db.ts:525-528` — `deleteLigneDevis(id)` : `DELETE FROM devis_lignes WHERE id = ?`
  (pas de filtre sur devisId).

### Fix

Ajouter une vérification que la ligne appartient au devis contrôlé :

```typescript
// Avant la suppression/mise à jour :
const lignes = await db.getLignesDevisByDevisId(input.devisId);
const ligneOwned = lignes.find(l => l.id === input.id);
if (!ligneOwned) {
  throw new TRPCError({ code: "NOT_FOUND", message: "Ligne non trouvée" });
}
```

---

## 🔴 BLOCKER 2 — Aucun contrôle d'accès sur `devisOptions.updateLigne` et `deleteLigne`

### Problème

Ces deux mutations n'utilisent **pas du tout `ctx`** — elles n'identifient pas l'artisan
appelant. Tout utilisateur authentifié peut modifier ou supprimer n'importe quelle ligne
d'option de devis sur toute la plateforme.

### Preuve

- `server/routers.ts:5605` — `async ({ input }) => { ... }` — pas de `ctx`.
- `server/routers.ts:5634` — `async ({ input }) => { ... }` — pas de `ctx`.
- `db.updateDevisOptionLigne(id, data)` et `db.deleteDevisOptionLigne(input.id)` :
  opèrent directement sur l'ID sans aucun filtre artisan.

### Fix

Ajouter la vérification via le `devisOption` parent :

```typescript
// Récupérer l'option et vérifier l'ownership via le devis parent
const option = await db.getDevisOptionById(input.optionId);
const artisan = await db.getArtisanByUserId(ctx.user.id);
const devis = option ? await db.getDevisById(option.devisId) : null;
if (!option || !devis || !artisan || devis.artisanId !== artisan.id) {
  throw new TRPCError({ code: "NOT_FOUND", message: "Option non trouvée" });
}
```

---

## 🟡 HIGH — IDOR lecture sur `rapports.getById`

### Problème

`rapports.getById` lit un rapport par ID **sans vérifier qu'il appartient à l'artisan
appelant**. Fuite de données de rapports d'autres artisans.

### Preuve

- `server/routers.ts:5651-5655` — `async ({ input }) => { return await db.getRapportPersonnaliseById(input.id); }`
  (pas de `ctx`, pas de vérification artisanId).

### Fix

```typescript
getById: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ ctx, input }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan) throw new TRPCError({ code: "NOT_FOUND" });
    const rapport = await db.getRapportPersonnaliseById(input.id);
    if (!rapport || rapport.artisanId !== artisan.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Rapport non trouvé" });
    }
    return rapport;
  }),
```

---

## Ce qui est bien protégé (pour information)

- Toutes les opérations principales devis/factures/clients/interventions/contrats
  utilisent `dbSecure.*` avec filtre `artisanId`.
- Les endpoints voice (`/api/voice/token`, `/api/voice/tool`, `/api/voice/persist`)
  vérifient le cookie JWT.
- Le portail client et les signatures utilisent des tokens opaques correctement validés.
- Rate-limiting sur `auth.signin` / `auth.signup` (5 req / 15 min / IP).

---

## Estimation

- BLOCKER 1 (lignes devis) : ~30 min — 4 lignes à ajouter dans `deleteLigne` + `updateLigne`.
- BLOCKER 2 (devisOptions) : ~30 min — ajouter `ctx` et ownership check dans 2 mutations.
- HIGH (rapports) : ~15 min — ajouter filtre artisanId dans `getById`.

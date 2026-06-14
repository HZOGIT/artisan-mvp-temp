# Audit — Congés / RH : approbation & soldes (IDOR) + recherche globale

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `congesRouter` (`routers.ts:5802`) — approbation/refus/annulation/
> suppression de congés et soldes ; + vérification rapide de `searchRouter`.

---

## Ce qui fonctionne correctement

- **Recherche globale (Ctrl+K)** `search.global` (`routers.ts:8019`) : les 5
  requêtes SQL sont **toutes scopées** `WHERE artisanId = ?` (dérivé serveur via
  `getArtisanByUserId`), placeholders paramétrés (pas d'injection), bornées
  (LIMIT 5/3). **RAS — pas d'issue.** ✓
- `conges.list` / `enAttente` / `byPeriode` / `create` sont scopés sur
  `getOrCreateArtisan(ctx.user.id)`. ✓

---

## 🔴 BLOCKER — IDOR multi-tenant sur l'approbation/suppression de congés + corruption des soldes

Toutes les mutations d'approbation et la suppression de congés agissent sur un
`congeId` **sans vérifier l'appartenance** à l'artisan appelant. Les helpers DB
ne scopent que par `id` :

```typescript
// db.ts — aucun artisanId
getCongeById(id):        ... .where(eq(conges.id, id))
updateCongeStatut(id,…): ... .where(eq(conges.id, id))
deleteConge(id):         ... .delete(conges).where(eq(conges.id, id))
```

### 1. `approuver` (`routers.ts:5848`) — approbation + corruption de solde cross-tenant

```typescript
.mutation(async ({ ctx, input }) => {
  const conge = await db.getCongeById(input.id);          // ← id non vérifié
  if (conge) {
    // ...calcul jours...
    if (conge.type === 'conge_paye' || conge.type === 'rtt') {
      await db.updateSoldeConges(conge.technicienId, conge.type, year, jours); // ← solde d'un AUTRE tenant
    }
  }
  return await db.updateCongeStatut(input.id, 'approuve', ctx.user.id, input.commentaire);
})
```

→ approuve le congé d'un salarié **d'une autre entreprise** ET **modifie son
solde de congés** (`updateSoldeConges` sur `conge.technicienId`).

### 2. `refuser` (`:5869`) / `annuler` (`:5875`) — write cross-tenant

`updateCongeStatut(input.id, 'refuse'/'annule', …)` sans même lire/vérifier le
congé → bascule le statut de n'importe quel congé.

### 3. `delete` (`:5881`) — suppression cross-tenant (hard delete)

```typescript
delete: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ input }) => {          // ← pas de ctx du tout
    await db.deleteConge(input.id);          // DELETE WHERE id = ?
    return { success: true };
  }),
```

→ **suppression définitive** d'un congé de n'importe quel tenant.

### 4. `getSoldes` (`:5887`) / `initSolde` (`:5893`) — soldes RH cross-tenant

`getSoldes({ technicienId, annee })` → `getSoldesConges(technicienId, annee)`
sans ownership → **lecture des soldes de congés** de n'importe quel technicien
(idem `initSolde` en écriture).

### Exploitation

En itérant `id`/`technicienId = 1..N` : approuver/refuser/**supprimer** les
congés de toutes les entreprises, et corrompre les soldes RH (ajout/déduction de
jours) des salariés d'autrui. Données RH d'autres tenants altérées/détruites par
un tiers.

### Lien avec OPE-31

OPE-31 couvrait la **lecture** `conges.byTechnicien` (+ notificationsPush). Les
mutations **d'approbation/suppression** (`approuver`/`refuser`/`annuler`/`delete`,
par `congeId`) et `getSoldes`/`initSolde` ne sont **pas** énumérées dans OPE-31 et
sont plus graves (write + hard delete + corruption de solde). À traiter ensemble :
**scoper TOUT le `congesRouter` par ownership artisan**.

### Fix proposé

Helper d'ownership, branché sur chaque route :

```typescript
async function assertCongeOwner(congeId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  const conge = await db.getCongeById(congeId);
  // le congé porte technicienId → vérifier que le technicien appartient à l'artisan
  const tech = conge ? await db.getTechnicienById(conge.technicienId) : null;
  if (!artisan || !conge || !tech || tech.artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Congé introuvable" });
  }
  return { artisan, conge };
}
```

+ pour `getSoldes`/`initSolde` : `assertTechnicienOwnership(technicienId, …)`
(helper déjà présent dans `geolocalisationRouter`).

### Estimation

~1,5 h — helper ownership + branchement sur approuver/refuser/annuler/delete/
getSoldes/initSolde + test cross-tenant.

---

## Estimation totale

- BLOCKER (IDOR write/delete congés + soldes) : ~1,5 h

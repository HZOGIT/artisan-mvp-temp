# Audit — Contrats / RDV / Interventions

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

---

## Ce qui fonctionne correctement

- `rdvRouter.confirm/refuse/proposeAutreCreneau` : ownership check `rdv.artisanId !== artisan.id` ✓
- `contratsRouter.getById/update/delete/generateFacture` : ownership check systématique ✓
- `interventionsRouter.*` : utilise `dbSecure.*Secure()` avec ownership partout ✓
- `interventionsRouter.assignerTechnicien` : double check intervention + technicien ownership ✓
- `vitrineRouter.demanderRdv` : token `crypto.randomUUID()` (128-bit) + expiry 90j ✓
- `vitrineRouter.getMesRdv` : clientId/artisanId issus du token en DB, pas de l'input ✓
- `clientPortalAccess` : `expiresAt` + `isActive` vérifiés à chaque accès ✓

---

## 🔴 BLOCKER — `contratsRouter.updateIntervention` IDOR : id intervention non vérifié

### Problème

`contrats.updateIntervention` (`server/routers.ts:4481`) vérifie que l'artisan possède le
`contratId` fourni, mais appelle ensuite `db.updateInterventionContrat(input.id, ...)` **sans
vérifier que `input.id` appartient à ce contrat**.

```typescript
// routers.ts:4494-4508
.mutation(async ({ ctx, input }) => {
  const contrat = await db.getContratById(input.contratId);  // vérifie contratId ✓
  if (!artisan || contrat.artisanId !== artisan.id) { throw FORBIDDEN; }
  const { id, contratId, ...updateData } = input;
  return db.updateInterventionContrat(id, updateData);  // ← id non vérifié ✗
})
```

### Exploitation

- Artisan A possède le contrat `c10` avec intervention `i1` (id=1)
- Artisan B possède le contrat `c20` avec intervention `i2` (id=2)
- Artisan A appelle `updateIntervention({ id: 2, contratId: 10, ... })` :
  - Le check passe (contrat 10 ∈ artisan A) ✓
  - `db.updateInterventionContrat(2, ...)` modifie l'intervention de l'artisan B ✗

La même faille existe avec `id` de la table `interventions_contrat` appartenant à n'importe
quel artisan de la plateforme.

### Fix

Vérifier l'appartenance de l'intervention au contrat avant la mise à jour :

```typescript
.mutation(async ({ ctx, input }) => {
  const contrat = await db.getContratById(input.contratId);
  if (!contrat) throw new TRPCError({ code: "NOT_FOUND", ... });
  const artisan = await db.getArtisanByUserId(ctx.user.id);
  if (!artisan || contrat.artisanId !== artisan.id) throw new TRPCError({ code: "FORBIDDEN", ... });

  // Vérification supplémentaire : l'intervention appartient bien à ce contrat
  const intervention = await db.getInterventionContratById(input.id);
  if (!intervention || intervention.contratId !== input.contratId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Intervention introuvable pour ce contrat" });
  }

  const { id, contratId, ...updateData } = input;
  return db.updateInterventionContrat(id, { ...updateData, ... });
})
```

### Estimation

~30 min — vérification + test

---

## 🟠 HIGH — `contratsRouter.create` : clientId non vérifié → contrat inter-artisan

### Problème

`contrats.create` (`server/routers.ts:4274`) crée un contrat avec `clientId` fourni par l'appelant
**sans vérifier que ce client appartient à l'artisan** :

```typescript
// routers.ts:4290-4316
.mutation(async ({ ctx, input }) => {
  let artisan = await db.getOrCreateArtisan(ctx.user.id);
  return await db.createContrat({
    artisanId: artisan.id,
    clientId: input.clientId,   // ← jamais vérifié
    ...
  });
})
```

Un artisan peut créer un contrat pour `clientId=999` appartenant à un autre artisan, puis
déclencher `generateFacture` sur ce contrat — ce qui expose les données du client 999 (email,
adresse) dans la facture générée.

Comparé à `interventionsRouter.create` qui vérifie correctement :
```typescript
const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
if (!client) throw new TRPCError({ code: "NOT_FOUND", ... });
```

### Fix

Même pattern que `interventionsRouter.create` :

```typescript
.mutation(async ({ ctx, input }) => {
  let artisan = await db.getOrCreateArtisan(ctx.user.id);
  // Vérifier ownership du client
  const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
  if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client non trouvé" });
  // ... reste inchangé
})
```

### Estimation

~15 min

---

## Estimation totale

- BLOCKER (IDOR updateIntervention) : ~30 min
- HIGH (clientId create) : ~15 min

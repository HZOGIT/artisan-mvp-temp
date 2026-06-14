# Audit — Notifications & routes « technicienId » (IDOR multi-tenant)

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : `notificationsRouter`, `notificationsPushRouter`, et le pattern
> systémique des routes qui acceptent un `technicienId` en input.

---

## Ce qui fonctionne correctement

- **`notificationsRouter`** (`routers.ts:2057`) : toutes les mutations
  (`markAsRead`, `archive`, `delete`) passent `artisan.id` au helper, et les
  helpers forcent bien `WHERE id = ? AND artisanId = ?`
  (`db.ts` `markNotificationAsRead` / `archiveNotification`). Lecture scopée
  sur `getNotificationsByArtisanId(artisan.id)`. ✓
- Le **bon pattern d'ownership technicien existe déjà** dans `techniciensRouter`
  (`routers.ts:4819-4820`) :
  ```typescript
  const technicien = await db.getTechnicienById(input.id);
  if (!technicien || technicien.artisanId !== artisan.id) throw FORBIDDEN;
  ```

---

## 🔴 BLOCKER — IDOR multi-tenant : routes `technicienId` sans vérification d'appartenance

`techniciens.artisanId` existe (`schema.ts:716`, NOT NULL), mais
`notificationsPushRouter` et `congesRouter.byTechnicien` passent le `technicienId`
fourni par l'appelant **directement aux helpers DB**, qui ne scopent que par
`technicienId`. Aucun `getTechnicienById + artisanId !== artisan.id`. N'importe
quel artisan authentifié peut donc cibler les techniciens d'un **autre** artisan
(ids séquentiels, trivialement énumérables).

### A. `notificationsPushRouter` (`routers.ts:5728`) — tout le routeur

| Route | Ligne | Impact cross-tenant |
| -- | -- | -- |
| `subscribe` | 5729 | Enregistre un **endpoint push arbitraire** sous le `technicienId` d'un autre artisan → **détournement de la livraison push** : l'attaquant reçoit les notifications de ce technicien (assignations, messages — contiennent noms clients / détails interventions). |
| `getHistorique` | 5770 | **Lecture de l'historique push** de n'importe quel technicien (`titre`/`corps` = données client/intervention). |
| `getPreferences` | 5748 | Lecture des préférences de notif d'autrui. |
| `unsubscribe` | 5741 | Supprime une souscription par `endpoint` (DoS de la livraison). |
| `markAsRead` | 5776 | Marque lu n'importe quel id d'historique. |
| `send` | 5784 | Injecte une entrée d'historique de notif pour n'importe quel technicien (spoofing). |

Preuve (aucun `ctx`, aucun ownership) :
```typescript
// routers.ts:5770
getHistorique: protectedProcedure
  .input(z.object({ technicienId: z.number(), limit: z.number().default(50) }))
  .query(async ({ input }) => {
    return await db.getHistoriqueNotificationsPush(input.technicienId, input.limit);
  }),
// db.ts — scope uniquement par technicienId
.where(eq(historiqueNotificationsPush.technicienId, technicienId))
```

### B. `congesRouter.byTechnicien` (`routers.ts:5815`) — lecture de congés (dont arrêts maladie)

```typescript
byTechnicien: protectedProcedure
  .input(z.object({ technicienId: z.number() }))
  .query(async ({ input }) => {                       // ← pas de ctx, pas d'ownership
    return await db.getCongesByTechnicien(input.technicienId);
  }),
```

`getCongesByTechnicien` scope uniquement par `technicienId`. Le type de congé
inclut **`maladie`** (arrêt maladie) → lecture cross-tenant de données
d'absence / santé des salariés d'une autre entreprise. Confidentialité aggravée.

### Exploitation

Itérer `technicienId = 1..N` :
- `getHistorique` / `byTechnicien` → dump des notifications et des arrêts maladie
  des techniciens de toute la plateforme.
- `subscribe` avec son propre endpoint → intercepter en continu les push d'un
  technicien ciblé.

### Étendue probable (à balayer dans le même lot)

D'autres routes `technicienId` partagent vraisemblablement le défaut (même
root cause) — à vérifier/corriger en même temps : positions/géolocalisation
(`~5265-5336`), soldes de congés (`~5889`), badges/objectifs (`~6194-6241`).

### Fix proposé

Helper réutilisable, branché en tête de chaque route prenant `technicienId` :

```typescript
async function assertTechnicienOwnership(technicienId: number, userId: number) {
  const artisan = await db.getArtisanByUserId(userId);
  if (!artisan) throw new TRPCError({ code: "NOT_FOUND" });
  const tech = await db.getTechnicienById(technicienId);
  if (!tech || tech.artisanId !== artisan.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Technicien introuvable" });
  }
  return { artisan, tech };
}
```

(Le pattern existe déjà en clair dans `techniciensRouter:4819` — il suffit de le
généraliser.)

### Estimation

~2 h — helper + branchement sur `notificationsPushRouter` (6 routes) +
`conges.byTechnicien` + balayage des autres routes `technicienId` + tests.

---

## Estimation totale

- BLOCKER (IDOR routes technicienId : push + congés) : ~2 h

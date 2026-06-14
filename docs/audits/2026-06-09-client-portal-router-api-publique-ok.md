# Audit — API portail client (token-based, `clientPortalRouter`) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `clientPortalRouter` (`routers.ts:3702-4210`) — la principale surface
> **non authentifiée** (accès par token, côté *client* et non artisan) :
> `generateAccess`, `verifyAccess`, `getDevis/Factures/Interventions/Contrats/ClientInfo`,
> `getConversations`, `getConversationMessages`, `sendClientMessage`,
> `markClientMessagesAsRead`, `getCreneauxDisponibles`, `demanderRdv`, `getStatus`,
> `deactivate`. Source du token : `getClientPortalAccessByToken` (`db.ts:1823`).

---

## Conclusion : surface portail solide. Pas de BLOCKER/HIGH.

### 1) Cycle de vie du token appliqué **à la source** (pas seulement à la création)

`getClientPortalAccessByToken` filtre en SQL sur **`isActive = true` ET
`expiresAt >= now()`** (`db.ts:1826-1830`). Donc **tout** `publicProcedure` qui résout
l'accès via ce helper rejette automatiquement un token **désactivé** (via `deactivate`)
ou **expiré** → la révocation d'accès est réellement effective (pas un simple flag UI).
Token = `crypto.randomUUID()` (~122 bits, non énumérable), validité 90 j (`:3720-3722`).

### 2) Données client toujours scopées `access.clientId` / `access.artisanId`

`getDevis/Factures/Interventions/Contrats` → `getXByClientId(access.clientId)` : le client
ne voit **que ses propres** documents, jamais ceux d'un autre client du même artisan.
`access.clientId`/`access.artisanId` viennent du token, jamais de l'input.

### 3) Ownership par-input vérifié sur les conversations

- `getConversationMessages` (`:4092-4094`) et `sendClientMessage` (`:4104-4106`) :
  `conv.clientId !== access.clientId || conv.artisanId !== access.artisanId` → `FORBIDDEN`
  **avant** lecture/écriture → pas d'IDOR sur le `conversationId` d'entrée.

### 4) `generateAccess` (protégé) valide l'appartenance du client

`client.artisanId !== artisan.id` → `FORBIDDEN` (`:3712`). `getStatus`/`deactivate`
passent par `getPortalAccessByClientId(clientId, artisan.id)` (scopé artisan).

---

## 🟡 LOW — IDOR mineur sur `markClientMessagesAsRead` (sous le seuil BLOCKER/HIGH)

```typescript
// routers.ts:4127
markClientMessagesAsRead: publicProcedure
  .input(z.object({ token: z.string(), conversationId: z.number() }))
  .mutation(async ({ input }) => {
    const access = await db.getClientPortalAccessByToken(input.token);
    if (!access) throw new TRPCError({ code: "UNAUTHORIZED" });
    await db.markMessagesAsRead(input.conversationId, 'client');   // ⚠ pas de vérif d'appartenance
    return { success: true };
  }),
```

Contrairement à `getConversationMessages`/`sendClientMessage`, cette mutation **ne vérifie
pas** `conv.clientId/artisanId === access.*` avant d'appeler `markMessagesAsRead`. Un
porteur de **n'importe quel** token portail valide peut, en énumérant `conversationId`,
marquer « lu » les messages d'une **autre** conversation (cross-client/cross-tenant).

**Impact = LOW** : aucune **divulgation** de contenu (la fonction ne retourne rien), pas
d'effet financier — seulement un faux « lu » qui peut masquer un non-lu côté artisan
(nuisance/intégrité). → **Pas d'issue Linear** (sous le seuil BLOCKER/HIGH du cron).

**Fix trivial** (aligner sur les 2 autres) :
```typescript
const conv = await db.getConversationById(input.conversationId);
if (!conv || conv.clientId !== access.clientId || conv.artisanId !== access.artisanId)
  throw new TRPCError({ code: "FORBIDDEN" });
```

*(Rappel : `demanderModification`/`soumettreDemandeIA` ont un point d'injection HTML dans
l'email artisan — **déjà filé** (sweep injection-HTML). Pas de doublon.)*

---

## Verdict

API portail client : **révocation/expiration appliquées à la source**, token UUID fort,
données **scopées `access.clientId`**, ownership par-input OK sur les conversations,
`generateAccess` valide l'appartenance. Un seul écart, un **IDOR LOW** « mark-as-read »
sans divulgation (`markClientMessagesAsRead`, fix 3 lignes). **Pas de nouvelle issue
Linear.**

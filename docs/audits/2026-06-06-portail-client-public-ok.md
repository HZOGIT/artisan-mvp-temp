# Audit — Portail client public & messagerie (RAS bloquant)

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : toutes les `publicProcedure` du `clientPortalRouter` (accès client
> sans login, par token), la messagerie client/artisan (`chatRouter`), et la
> soumission publique d'avis (`avisRouter`). **Aucun BLOCKER ni HIGH trouvé** →
> pas d'issue Linear, conformément à la procédure.

---

## Ce qui a été vérifié et est correct

### Token portail — robuste
- `getClientPortalAccessByToken` (`db.ts`) filtre en SQL sur **`isActive = true`
  ET `expiresAt >= now()`** → un token révoqué ou expiré (90 j) est inopérant.
- Token = `crypto.randomUUID()` (122 bits aléatoires) → non énumérable.
- **Toutes** les routes de données (`getDevis`, `getFactures`, `getInterventions`,
  `getContrats`, `getClientInfo`, `getMesRdv`, `getSuiviChantiers`,
  `getConversations`) résolvent `access.clientId` / `access.artisanId` **depuis le
  token** et ne font jamais confiance à un id fourni par l'appelant. Pas d'IDOR.

### Messagerie — ownership vérifié
- `clientPortal.getConversationMessages` (`routers.ts:4083`) et `sendClientMessage`
  (`:4095`) vérifient `conv.clientId === access.clientId && conv.artisanId ===
  access.artisanId` avant lecture/écriture. ✓
- Côté artisan, `chatRouter.getMessages` / `sendMessage` / `startConversation`
  (`routers.ts:4685-4747`) vérifient `conv.artisanId === artisan.id` et
  `client.artisanId === artisan.id`. ✓

### Avis publics — pas de forge possible
- `avisRouter.submitAvis` (`routers.ts:5165`) exige un **token de demande d'avis**
  valide (créé par l'artisan), refuse les demandes déjà `completee` (anti-rejeu)
  et expirées, et marque la demande complétée (usage unique). Impossible de
  flooder de faux avis / 1-étoile sans token valide. ✓

### Génération de lien
- `clientPortal.generateAccess` (`:3695`) vérifie `client.artisanId ===
  artisan.id` avant d'émettre un token. ✓

---

## Point mineur relevé (sévérité < HIGH — pas d'issue créée)

`clientPortal.markClientMessagesAsRead` (`routers.ts:4118`) est la **seule** route
messagerie qui **n'effectue pas** le contrôle d'appartenance de la conversation,
contrairement à ses sœurs `getConversationMessages` / `sendClientMessage` :

```typescript
// routers.ts:4118 — pas de vérification conv ∈ (clientId, artisanId)
markClientMessagesAsRead: publicProcedure
  .input(z.object({ token: z.string(), conversationId: z.number() }))
  .mutation(async ({ input }) => {
    const access = await db.getClientPortalAccessByToken(input.token);
    if (!access) throw new TRPCError({ code: "UNAUTHORIZED" });
    await db.markMessagesAsRead(input.conversationId, 'client'); // ← conversationId non vérifié
    return { success: true };
  }),
```

**Impact réel : faible.** Un détenteur de token portail valide peut basculer le
flag « lu » des messages d'une **autre** conversation (autre tenant) en devinant
un `conversationId`. Pas de divulgation de données (aucun message renvoyé), juste
une altération d'état read/unread → un artisan pourrait croire à tort qu'un
message a été lu. Pas de gain financier ni fuite PII → en-dessous du seuil HIGH.

**Fix (1 ligne de garde, même pattern que la route voisine) :**

```typescript
const conv = await db.getConversationById(input.conversationId);
if (!conv || conv.clientId !== access.clientId || conv.artisanId !== access.artisanId)
  throw new TRPCError({ code: "FORBIDDEN" });
```

À regrouper avec le lot IDOR (OPE-9/10/30/31) si une passe de sécurité globale
est menée, mais ne justifie pas une issue bloquante isolée.

---

## Conclusion

Le portail client public, la messagerie et les avis sont **correctement
sécurisés** pour le lancement. Aucun BLOCKER/HIGH. Seul un durcissement mineur
(1 ligne) est suggéré sur `markClientMessagesAsRead`.

# Audit — Portail client : `markClientMessagesAsRead` sans contrôle d'appartenance → IDOR cross-tenant (intégrité du statut de lecture)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟡 MEDIUM** (isolation multi-tenant violée, impact limité au statut de lecture — pas de divulgation)

> Domaine : surface **publique** du portail client (messagerie). Sweep des `publicProcedure` token-based de `clientPortalRouter`.

---

## Constat : un endpoint public de la messagerie ne vérifie PAS que la conversation appartient au client du token

`clientPortalRouter` (messagerie, `server/routers.ts`) expose 4 endpoints publics token-based. **Trois** vérifient l'appartenance de la conversation, **un** ne le fait pas :

| Endpoint | Ligne | Contrôle `conv.clientId === access.clientId && conv.artisanId === access.artisanId` ? |
| -- | -- | -- |
| `getConversations` | `:4556` | scopé par `clientId`+`artisanId` dans la requête ✅ |
| `getConversationMessages` | `:4564` | **OUI** (`:4570` → `FORBIDDEN`) ✅ |
| `sendClientMessage` | `:4576` | **OUI** (`:4586` → `FORBIDDEN`) ✅ |
| **`markClientMessagesAsRead`** | **`:4608`** | ❌ **NON** — vérifie seulement la validité du token |

```typescript
// server/routers.ts:4608 — markClientMessagesAsRead
markClientMessagesAsRead: publicProcedure
  .input(z.object({ token: z.string(), conversationId: z.number() }))
  .mutation(async ({ input }) => {
    const access = await db.getClientPortalAccessByToken(input.token);
    if (!access) throw new TRPCError({ code: "UNAUTHORIZED" });
    // ⚠ AUCUN check que conversationId appartient à access.clientId/artisanId
    await db.markMessagesAsRead(input.conversationId, 'client');
    return { success: true };
  }),
```

La fonction sous-jacente n'est **pas** scopée non plus :

```typescript
// server/db.ts markMessagesAsRead(conversationId, lecteur) — opère sur N'IMPORTE QUEL conversationId
await db.update(messages).set({ lu: true })
  .where(and(eq(messages.conversationId, conversationId), eq(messages.auteur, 'artisan'), eq(messages.lu, false)));
await db.update(conversations).set({ nonLuClient: 0 }).where(eq(conversations.id, conversationId));
```

## Exploitation (cross-tenant)

`conversationId` est un identifiant **global** (auto-increment, non scopé). Un client disposant d'**un** token de portail valide (le sien, n'importe quel tenant) peut appeler `markClientMessagesAsRead({ token: <son token>, conversationId: <id arbitraire> })` pour **n'importe quelle** conversation du système, y compris celles d'**un autre artisan / d'un autre client**. Effets sur la conversation ciblée :

1. **Faux accusé de lecture** : les messages `artisan→client` passent `lu = true` → l'artisan victime voit « le client a lu mes messages » alors que non.
2. **Compteur de non-lus remis à zéro** (`nonLuClient = 0`) → le badge « messages non lus » du **client victime** dans son portail est effacé → il peut **manquer** un nouveau message de son artisan.

Aucune **divulgation** de contenu (la mutation renvoie `{ success: true }`) ni destruction de message → impact = **intégrité du statut de lecture**, en **cross-tenant**.

## Sévérité — MEDIUM

- **Pour** : c'est une **violation d'isolation multi-tenant** sur un endpoint **public** (la propriété d'isolation est un invariant de lancement), authz manquante là où les 3 endpoints frères l'ont.
- **Contre (limite l'impact)** : pas de lecture de données d'autrui (aucune fuite), pas de suppression ; seulement le flag `lu` + le compteur `nonLuClient`. Pas de levier financier. → **MEDIUM**, pas BLOCKER.

## Fix proposé (trivial, aligné sur les endpoints frères)

Ajouter le **même contrôle d'appartenance** que `getConversationMessages`/`sendClientMessage` avant l'appel :

```typescript
const conv = await db.getConversationById(input.conversationId);
if (!conv || conv.clientId !== access.clientId || conv.artisanId !== access.artisanId)
  throw new TRPCError({ code: "FORBIDDEN" });
await db.markMessagesAsRead(input.conversationId, 'client');
```

(Defense-in-depth optionnelle : scoper `markMessagesAsRead` par `artisanId`/`clientId` en base, comme les autres helpers de la messagerie.)

## Anti-doublon

- `2026-06-11-chat-sendmessage-ownership-ok.md` couvrait **`sendClientMessage`** (scopé ✅) — **pas** `markClientMessagesAsRead`.
- `2026-06-09-client-portal-router-api-publique-ok.md` / `2026-06-11-portail-client-data-scoping-ok.md` : revue générale du portail, **n'ont pas relevé** ce point précis.
- Distinct des audits XSS messagerie (`2026-07-messagerie-xss-ok.md`) et bornes texte (`2026-06-12-bornes-texte-chat-avis-reponse-fix.md`).

→ **Finding neuf** → issue Linear créée.

## Verdict

`clientPortalRouter.markClientMessagesAsRead` (`:4608`) **omet** le contrôle d'appartenance de la conversation présent sur ses 3 frères → **IDOR cross-tenant** permettant de falsifier le statut de lecture + remettre à zéro le compteur de non-lus de n'importe quelle conversation. **MEDIUM** (isolation violée, intégrité seule, pas de divulgation). **Fix trivial** (3 lignes, copier le check des frères).

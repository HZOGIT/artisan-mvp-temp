# Audit — Chat `sendMessage` (artisan) : ownership conversation — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `chat.sendMessage` (`routers.ts:4704-4738`) — envoi d'un message par
> l'artisan dans une conversation client.

---

## Conclusion : conversation ownership vérifié. Pas de BLOCKER/HIGH.

### Pas d'IDOR sur la conversation

```typescript
// routers.ts:4709-4710
const conv = await db.getConversationById(input.conversationId);
if (!conv || conv.artisanId !== artisan.id) throw FORBIDDEN;
```

→ Un `conversationId` appartenant à un **autre tenant** = `FORBIDDEN` **avant** écriture.
Impossible d'injecter un message dans la conversation d'un autre artisan. `createMessage`
est scopé à la conversation validée ; la notif email cible `conv.clientId` (le client de
cette conversation).

Côté **client**, `clientPortal.sendClientMessage` applique le **même** check
(`conv.clientId/artisanId === access.*`, déjà -ok). Les deux sens du chat sont cloisonnés.

---

## Écart connu = déjà rattaché

- `input.contenu` est interpolé **non échappé** dans le body de l'email au client
  (`:4734`) → **injection HTML** (artisan-controlled → self-XSS de son client). C'est le
  point **`4726`** déjà **rattaché à OPE-59** (audit 2026-06-11, sweep incomplet). Pas de
  doublon.

---

## Verdict

`chat.sendMessage` vérifie l'**ownership de la conversation** (`conv.artisanId ===
artisan.id`) → pas d'IDOR ; le client-portal applique le check symétrique. L'injection HTML
de `contenu` dans l'email est **déjà rattachée (OPE-59)**. **Pas de nouvelle issue Linear.**

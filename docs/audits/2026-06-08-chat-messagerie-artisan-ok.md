# Audit — Messagerie interne côté artisan (chatRouter) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `chatRouter` (`routers.ts:4673`) — `getConversations`,
> `getMessages`, `sendMessage`, `startConversation`, `archive`/`close
> Conversation`, `getUnreadCount`. (Le côté client/portail a été couvert dans
> l'audit portail ; le XSS in-app dans `2026-07-messagerie-xss-ok.md`.)

---

## Conclusion : pas de BLOCKER/HIGH. Isolation correcte.

### Ownership systématique — pas d'IDOR

- `getConversations` / `getUnreadCount` : scopés `getConversationsByArtisanId(
  artisan.id)` / `getUnreadMessagesCount(artisan.id)`.
- `getMessages` / `sendMessage` / `archiveConversation` / `closeConversation` :
  chargent la conversation puis vérifient **`conv.artisanId !== artisan.id` ⇒
  FORBIDDEN** (`:4690`, `:4701`, etc.).
- **`startConversation`** : valide aussi le client — **`client.artisanId !==
  artisan.id` ⇒ FORBIDDEN** (`:4747`) → pas de conversation créée vers le client
  d'un autre tenant (contraste avec les `create` qui oublient cette validation,
  cf. OPE-25).

---

## Réserve (mineure) — email de notification : `contenu` non échappé

`sendMessage` envoie au client un email de notification contenant le message de
l'artisan **interpolé brut** :

```typescript
// routers.ts (~4725) — body de l'email au client
<p style="margin:0">${input.contenu.substring(0, 300)}${input.contenu.length > 300 ? '...' : ''}</p>
```

Direction **artisan → client** (même classe qu'OPE-12 `customMessage`) : un compte
artisan compromis pourrait injecter du HTML/liens dans l'email reçu par le client.
**Severité faible** (artisan→son propre client) mais **même fix** que le sweep
d'échappement. → **Ajouté à OPE-59** (inventaire des templates email à échapper).
Pas d'issue séparée.

---

## Verdict

Messagerie artisan **vérifiée saine** : ownership `conv.artisanId` sur toutes les
routes, `clientId` validé à la création de conversation, pas d'IDOR. Seule réserve :
1 template email (`sendMessage`) à inclure dans le sweep **OPE-59**. **Pas de
nouvelle issue.**

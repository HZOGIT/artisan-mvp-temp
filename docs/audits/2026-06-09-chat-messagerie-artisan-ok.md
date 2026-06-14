# Audit — Chat / messagerie (côté artisan, `chatRouter`) — OK (1 point d'injection rattaché à OPE-12)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `chatRouter` (`routers.ts:4673-4797`) — `getConversations`, `getMessages`,
> `sendMessage`, `startConversation`, `archive/close/reopenConversation`,
> `getUnreadCount`. Complète l'audit du portail client (`sendClientMessage` côté client,
> déjà vérifié sain).

---

## Conclusion : pas d'IDOR. Pas de BLOCKER/HIGH nouveau.

### Multi-tenant correct (aucun IDOR)

Tous les endpoints prenant un `conversationId` vérifient l'appartenance avant
lecture/écriture :
- `getMessages` (`:4690`) et `sendMessage` (`:4701`) : `if (!conv || conv.artisanId
  !== artisan.id) throw FORBIDDEN`.
- `archiveConversation`/`closeConversation`/`reopenConversation`
  (`:4774/4784/4794`) : même garde.
- `startConversation` (`:4747`) : vérifie `client.artisanId === artisan.id` avant de
  créer la conversation.
- `getConversations`/`getUnreadCount` : scopés `artisan.id`.

→ impossible de lire/écrire/modifier la messagerie d'un autre tenant.

### Lien portail sain

L'email de notification (`sendMessage`) construit le lien portail en **dur**
`https://www.operioz.com/portail/<token>` (`:4715`) → **pas** d'origin injection
(contraste avec OPE-76, qui ne concerne pas ce point).

---

## Point rattaché à **OPE-12** (pas de doublon)

`chat.sendMessage` interpole le message **brut** dans le HTML de l'email envoyé au
client (`:4725`) :
```typescript
<p style="margin:0">${input.contenu.substring(0, 300)}...</p>
```
Même classe qu'**OPE-12** (contenu **artisan-contrôlé → email client branded Operioz**,
sans échappement) : un compte compromis / collaborateur avec accès chat peut envoyer du
HTML/lien malveillant rendu dans l'email du client. Point **non énuméré** dans OPE-12 →
**OPE-12 étendu par commentaire** (à corriger dans le même lot, helper `escapeHtml`).
Pas de nouvelle issue.

---

## Réserves mineures (non bloquantes)

- **Pas de rate limit** sur `sendMessage` (un email au client par message) → spam
  intra-relation (l'artisan vers son propre client). Faible.
- `contenu` sans longueur max côté `sendMessage` (tronqué à 300 dans l'email mais
  stocké entier). Marginal.

---

## Verdict

Messagerie artisan : **multi-tenant correct** (tous les endpoints vérifient
`conv.artisanId === artisan.id`), lien portail en dur (pas d'origin injection). Unique
point : injection HTML dans l'email de notification (artisan→client), **même classe
qu'OPE-12** → rattaché par commentaire. **Pas de nouvelle issue Linear.**

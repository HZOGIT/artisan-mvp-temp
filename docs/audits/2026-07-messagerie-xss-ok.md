# Audit — Messagerie (chat artisan/client) : XSS & abus — RAS bloquant

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : rendu des messages de chat (artisan `Chat.tsx`, portail client
> `PortailClient.tsx`) et abus du `sendClientMessage` public. **Aucun
> BLOCKER/HIGH** → pas d'issue. Un point MEDIUM documenté.

---

## Ce qui fonctionne correctement

### Rendu des messages — sûr (pas de XSS)
Le contenu des messages — **contrôlé par le client** via le portail public
(`clientPortal.sendClientMessage`) — est rendu en **enfant texte React**, donc
**auto-échappé** :

```tsx
// Chat.tsx:260 (vue artisan)
<p className="text-sm whitespace-pre-wrap">{message.contenu}</p>
// PortailClient.tsx:754 (vue client)
<p className="text-sm whitespace-pre-wrap">{msg.contenu}</p>
```

Un message contenant `<img onerror=…>` / `<script>` s'affiche **littéralement**,
pas exécuté. **Pas de XSS stocké client→artisan.** ✓

> Constat utile : ceci **isole le risque XSS web au seul sink
> `dangerouslySetInnerHTML` de l'assistant (OPE-48)**. La messagerie, elle, suit la
> bonne pratique React (enfants texte). Les 3 occurrences de
> `dangerouslySetInnerHTML` restent : assistant (OPE-48, à corriger), CSS de
> graphe et `<style>` animations (dev-controlled, sûrs).

### Ownership messagerie
Vérifié précédemment (audit portail) : `getConversationMessages` /
`sendClientMessage` vérifient `conv.clientId === access.clientId &&
conv.artisanId === access.artisanId` ; côté artisan, `chatRouter` vérifie
`conv.artisanId === artisan.id`. ✓

---

## 🟡 MEDIUM (documenté, pas d'issue) — `sendClientMessage` sans rate limit ni borne de taille

`clientPortal.sendClientMessage` (publicProcedure, token portail) crée un message
**et** une notification à chaque appel, **sans rate limit** et avec
`contenu: z.string().min(1)` **sans `.max()`** :

```typescript
const msg = await db.createMessage({ ... });          // pas de limite de fréquence
await db.createNotification({ artisanId: access.artisanId, ... });  // 1 notif / message
```

Risque : un client (détenteur d'un token portail valide, 90 j) peut **spammer**
l'artisan de messages/notifications, ou envoyer un `contenu` très volumineux
(borné seulement par le body 50 Mo — cf. OPE-24).

Impact limité (token-gated à un **vrai client** de l'artisan, pas d'email envoyé,
rendu sûr) → **MEDIUM**. **Fix** : cooldown par `(conversationId, IP)` + `.max()`
sur `contenu` (à grouper avec OPE-36/OPE-24).

---

## Conclusion

La messagerie est **sûre côté XSS** (échappement React) et **scopée**. Aucun
BLOCKER/HIGH. Seul un rate limit / borne de taille sur `sendClientMessage` est
suggéré (MEDIUM, anti-spam).

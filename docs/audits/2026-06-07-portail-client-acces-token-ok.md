# Audit — Portail client public (modèle d'accès par token) — OK

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : tout le `clientPortalRouter` public (token-based) —
> `verifyAccess`, `getDevis`/`getFactures`/`getInterventions`/`getContrats`/
> `getClientInfo`, messagerie (`getConversations`, `getConversationMessages`,
> `sendClientMessage`, `markClientMessagesAsRead`), RDV en ligne
> (`getCreneauxDisponibles`, `demanderRdv`, `getMesRdv`), `getSuiviChantiers`,
> `demanderModification`, `soumettreDemandeIA` (IA). `routers.ts:3767-4234`.

---

## Conclusion : aucun BLOCKER/HIGH. Le portail est solide.

### Modèle d'accès — robuste

- **Token sécurisé** : `crypto.randomUUID()` (122 bits aléatoires), URL
  `/portail/{token}` (`routers.ts:~3711`).
- **Expiration appliquée** : `getClientPortalAccessByToken` filtre
  `isActive = true` **ET** `expiresAt >= NOW()` (`db.ts`) — validité 90 j. Un
  token expiré/désactivé n'ouvre rien.
- **Rotation** : `createClientPortalAccess` désactive l'accès actif précédent du
  client avant d'en créer un nouveau.

### Isolation — correcte

- **Toutes** les routes résolvent l'accès via le token puis scopent par
  `access.clientId` / `access.artisanId` (jamais d'id client/artisan pris depuis
  l'input).
- Les routes messagerie sensibles **vérifient l'appartenance de la conversation** :
  `getConversationMessages` (`:4084`) et `sendClientMessage` (`:4096`) refusent
  (`FORBIDDEN`) si `conv.clientId !== access.clientId || conv.artisanId !==
  access.artisanId`.
- `demanderRdv` valide le créneau (≥ 24 h à l'avance) et rattache le RDV au
  `access.clientId`/`artisanId`.

### Coût IA — borné

- `soumettreDemandeIA` (appel Gemini) est **rate-limité** :
  `checkRateLimit(artisan.id)` ⇒ `TOO_MANY_REQUESTS` (`routers.ts:3927`). Pas
  d'abus de l'API IA via le portail.

---

## Réserves mineures (pas d'issue, à folder dans des lots existants)

1. **`markClientMessagesAsRead` (`routers.ts:4118`)** ne vérifie **pas**
   l'appartenance de `conversationId` à `access.clientId` (contrairement à ses
   deux sœurs `getConversationMessages`/`sendClientMessage`). Un client portail
   peut donc marquer « lu côté client » les messages de **n'importe quelle**
   conversation (par id). **Impact très faible** : altération d'un flag de
   lecture (aucune divulgation de contenu, aucune donnée financière/PII). Fix
   trivial : ajouter le même check d'appartenance que les routes voisines (à
   inclure dans une passe de durcissement, pas bloquant).

2. **Injection HTML emails** : `demanderModification` (`:3904`) et
   `soumettreDemandeIA` interpolent l'input client brut dans l'email artisan —
   **déjà tracé dans OPE-59** (sweep d'échappement). Pas de nouvelle entrée.

3. **Accès portail indépendant de l'abonnement artisan** : les routes publiques
   ne passent pas le `subscriptionGuard` (utilisateur non authentifié ⇒ `next()`)
   → le portail d'un artisan expiré reste fonctionnel. Volet « routes hors guard »
   **déjà documenté dans OPE-64** (secondaire). Pas de nouvelle entrée.

---

## Verdict

Surface publique critique **vérifiée saine** : token cryptographique + expiration
appliquée + scoping systématique par `access.clientId` + ownership des
conversations + IA rate-limitée. Une seule réserve d'impact négligeable
(`markClientMessagesAsRead`) à corriger en passe de durcissement. **Pas d'issue
Linear créée.**

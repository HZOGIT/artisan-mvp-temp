# Audit — RDV en ligne & portail client (surface publique token-based) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `rdvRouter` (`routers.ts:7312`), flux RDV en ligne du portail
> (`getCreneauxDisponibles`/`demanderRdv`/`getMesRdv`, `routers.ts:4128-4216`) et
> l'ensemble des endpoints **publics token-based** du portail client
> (`verifyAccess`/`getDevis`/`getFactures`/`getInterventions`/`getContrats`/
> `getClientInfo`/`getConversations`/`sendClientMessage`…, `routers.ts:3767-4216`).
> Modèle de sécurité : token de portail (`client_portal_access`).

---

## Conclusion : surface saine. Pas de BLOCKER/HIGH nouveau.

### 1. Modèle de token portail — solide

- **Génération** : `crypto.randomUUID()` (`routers.ts:3711`) → 122 bits, non
  énumérable. Colonne `token varchar(64) UNIQUE` (`schema.ts:538`).
- **Validation** : `getClientPortalAccessByToken` (`db.ts:1823`) filtre bien
  `isActive = true` **ET** `expiresAt >= NOW()` → expiration + révocation
  effectivement appliquées (pas un simple `eq(token)`).
- `createClientPortalAccess` (`db.ts:1807`) désactive l'ancien accès actif avant
  d'en créer un nouveau (rotation propre).

### 2. Endpoints de données portail — correctement scopés (pas d'IDOR)

Tous les `getX` du portail **ignorent tout identifiant fourni par l'appelant** et
requêtent **strictement** par `access.clientId`/`access.artisanId` dérivés du token :
`getDevisByClientId(access.clientId)` (:3795), `getFacturesByClientId` (:3815),
`getInterventionsByClientId` (:3842), `getContratsByClientId` (:3861),
`getClientInfo` (:3872). → impossible de lire les données d'un autre client en
changeant un paramètre.

Les endpoints messagerie qui **acceptent un `conversationId`** vérifient
explicitement l'appartenance avant tout accès/écriture :
```ts
// getConversationMessages (:4084) ET sendClientMessage (:4096)
if (!conv || conv.clientId !== access.clientId || conv.artisanId !== access.artisanId)
  throw new TRPCError({ code: "FORBIDDEN" });
```
→ **pas d'IDOR** sur la lecture/écriture des messages.

### 3. Flux RDV en ligne — ownership OK

- `demanderRdv` (`:4169`, public token) crée le RDV avec `artisanId`/`clientId`
  **du token** (pas de l'input), borne min 24h. `getMesRdv` scopé `access.clientId`.
- Côté artisan, `rdvRouter.confirm/refuse/proposeAutreCreneau` (`:7330-7437`)
  vérifient tous `rdv.artisanId === artisan.id` avant action → pas de cross-tenant.

---

## Déjà couvert (anti-doublon → SKIP)

L'audit du sous-flux **signature SMS** (atteint via `getDevis.tokenSignature`) est
**intégralement tracé** — aucune nouvelle issue créée :

| Constat (re-vérifié dans le code) | Issue |
| -- | -- |
| `signDevis` (`:2706`) accepte `smsVerified` mais **ne le lit jamais** ; `db.signDevis` (`db.ts:1231`) ne consulte aucun enregistrement SMS → 2FA non imposé serveur | **OPE-14** |
| `requestSmsCode` renvoie `devCode` en clair si Twilio absent (`:2662`) | **OPE-15** |
| `verifySmsCode` (`db.ts:1294`) sans compteur de tentatives → brute-force | **OPE-22** |
| `requestSmsCode`/`verifySmsCode` publics sans rate limit → SMS bombing | **OPE-23** |
| OTP `Math.floor(100000 + Math.random()*900000)` (`:2631`) non crypto-sûr | **OPE-18** |
| Injection HTML email artisan via `demanderModification`/`soumettreDemandeIA` (`:3904`/3914) | **OPE-59** |

---

## Réserves mineures (non bloquantes, pas d'issue)

1. **`markClientMessagesAsRead` (`:4118`)** — seul endpoint messagerie **sans**
   contrôle d'appartenance : il appelle `markMessagesAsRead(input.conversationId,
   'client')` sans vérifier `conv.clientId === access.clientId`. Impact **négligeable**
   : bascule un flag « lu » sur une conversation tierce — **aucune divulgation**, aucune
   écriture de contenu. À aligner sur le garde des autres endpoints (1 ligne) par
   hygiène, mais pas un blocker.
2. **Pas de rate limit sur les mutations portail token-gated** (`demanderRdv`,
   `demanderModification`, `sendClientMessage`) — un détenteur de token (= le client
   lui-même) peut spammer son artisan de demandes/notifications. **Intra-relation**
   (token nominatif requis), donc MEDIUM au plus ; `soumettreDemandeIA` a déjà, lui,
   un rate-limit côté artisan (`:3926`). Recommandé après lancement, non bloquant.

---

## Verdict

Portail client & RDV en ligne : **modèle de token sain** (entropie + `isActive`/
`expiresAt` vérifiés), **endpoints scopés `access.clientId` → pas d'IDOR** de données,
ownership artisan vérifié sur les RDV. Le sous-flux signature/SMS est **déjà couvert**
(OPE-14/15/22/23/18/55) et l'injection HTML par OPE-59 → **SKIP anti-doublon**.
Réserves mineures (garde manquant sur `markClientMessagesAsRead`, pas de rate limit
sur les mutations portail) = MEDIUM non bloquant. **Pas d'issue Linear.**

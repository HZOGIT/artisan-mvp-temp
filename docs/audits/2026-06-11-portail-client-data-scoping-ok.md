# Audit — Portail client (endpoints de données par token) : cloisonnement OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `clientPortalRouter` (`routers.ts:3865`) — `generateAccess`, `verifyAccess`,
> `getDevis`/`getFactures`/`getInterventions`/`getContrats`/`getClientInfo` + helper
> `getClientPortalAccessByToken` (`db.ts`).

---

## Conclusion : portail **correctement cloisonné**. Token non devinable + expiry/révocation **appliqués en DB** + scoping strict par `access.clientId`. Aucun BLOCKER/HIGH. 1 réserve déjà filée (OPE-67).

### ✅ Token robuste et révocable

`generateAccess` (`:3867`, `protectedProcedure` + vérif `client.artisanId === artisan.id`) :
`crypto.randomUUID()` (**122 bits**, non énumérable), `expiresAt = +90 j`, ligne
`client_portal_access` avec `isActive`. → lien sécurisé, expirable, révocable.

### ✅ Expiry + révocation **appliqués au niveau DB** (pas seulement à l'affichage)

`getClientPortalAccessByToken` (`db.ts`) :
```ts
.where(and(
  eq(clientPortalAccess.token, token),
  eq(clientPortalAccess.isActive, true),
  gte(clientPortalAccess.expiresAt, new Date()),   // <- expiry forcée ici
))
```
→ un token **expiré ou désactivé** renvoie `null` ⇒ **tous** les endpoints (y compris
`verifyAccess`) retombent sur `UNAUTHORIZED`/`valid:false`. L'expiry 90 j n'est pas
cosmétique : elle est **garantie en base**, à chaque appel.

### ✅ Aucun IDOR — scoping systématique par `access.clientId`

Tous les endpoints publics résolvent d'abord l'`access` via le **token** puis ne lisent que
les données du **client du token** :
| Endpoint | Source |
| -- | -- |
| `getDevis` | `getDevisByClientId(access.clientId)` |
| `getFactures` | `getFacturesByClientId(access.clientId)` |
| `getInterventions` | `getInterventionsByClientId(access.clientId)` |
| `getContrats` | `getContratsByClientId(access.clientId)` |
| `getClientInfo` | `getClientById(access.clientId)` + `getArtisanById(access.artisanId)` |

Le `clientId` **n'est jamais** pris dans l'input → un porteur de token ne peut pas
demander les données d'un autre client. Le `clientId` étant propre à un artisan, le scope
par `clientId` suffit (pas de fuite cross-tenant). Les bodies d'email (`generateAccess`) sont
`safeHtml` (clientName/artisanName).

### ✅ Écritures portail également token-scopées

`demanderRdv` / `soumettreDemandeIA` / `sendClientMessage` (audités séparément) résolvent
l'`access` par token et forcent `access.artisanId`/`access.clientId` → pas d'écriture
cross-client.

---

## 🟡 Réserve — déjà filée (anti-doublon)

- **Exposition des brouillons** : `getFacturesByClientId`/`getDevisByClientId` peuvent
  renvoyer des documents en statut `brouillon` (travail non finalisé de l'artisan) au client.
  Déjà couvert par **OPE-67** (« le portail expose les brouillons au client » + facture
  brouillon payable). Pas de doublon.

---

## Verdict

Le **portail client** est **bien cloisonné** : token `randomUUID` non devinable,
**expiry 90 j + `isActive` appliqués dans la requête DB** (pas seulement côté UI), et
**scoping strict par `access.clientId`** sur tous les endpoints (lecture et écriture) → pas
d'IDOR, pas de fuite cross-tenant. **Aucun BLOCKER/HIGH.** Seule réserve (brouillons exposés)
= **OPE-67** déjà filée. **Pas de nouvelle issue Linear.**

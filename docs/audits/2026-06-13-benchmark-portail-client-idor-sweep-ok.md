# Benchmark/QA — Sweep IDOR / token-scoping du portail client public ✅ sain

**Date** : 2026-06-13 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe IDOR) · **Domaine** : Portail client (API publique token-based)

> Sweep complet de **tous** les endpoints `publicProcedure` de `clientPortalRouter`
> (`server/routers.ts:4426+`), surface **non authentifiée** (accès par token). Recherche :
> IDOR (id contrôlé par le client), sur-exposition cross-client/cross-tenant, token
> désactivé/expiré accepté, absence de rate-limit sur les mutations. ↔ Odoo « portal »
> (`portal`/`website` : accès par `access_token` scellé par `record._portal_ensure_token()`).

---

## ✅ Validation du token — complète

`getClientPortalAccessByToken` (`server/db.ts`) filtre :
- `token` exact, **ET** `isActive = true` (un accès **révoqué** via `deactivate` est rejeté),
- **ET** `expiresAt >= now()` (un token **expiré** est rejeté).
→ Un token désactivé/expiré renvoie `null` → `UNAUTHORIZED`. Le token est l'**unique** source d'autorité ; aucun endpoint ne fait confiance à un `clientId`/`artisanId` fourni par l'appelant. ✓

## ✅ Scoping de tous les endpoints (token → access.clientId / access.artisanId)

| Endpoint | Scoping | Verdict |
|---|---|---|
| `verifyAccess` / `getClientInfo` | via `access.*` | ✓ |
| `getDevis` | `getDevisByClientId(access.clientId)` | ✓ scopé client |
| `getFactures` | `getFacturesByClientId(access.clientId)` | ✓ scopé client |
| `getInterventions` | `getInterventionsByClientId(access.clientId)` | ✓ scopé client |
| `getContrats` | `getContratsByClientId(access.clientId, access.artisanId)` + **exclut `notes`** internes | ✓ (corrige l'ancienne sur-exposition) |
| `getSuiviChantiers` | `getChantiersByArtisan(access.artisanId)` **puis `.filter(c.clientId === access.clientId)`** | ✓ filtré client |
| `getMesRdv` | `getRdvByClientId(access.clientId, access.artisanId)` | ✓ |
| `getCreneauxDisponibles` | `getCreneauxOccupes(access.artisanId, …)` | ✓ |
| `getConversations` | `getConversationsByClientId(access.clientId, access.artisanId)` | ✓ |
| `getConversationMessages` / `sendClientMessage` / `markClientMessagesAsRead` | valident **`conv.clientId === access.clientId && conv.artisanId === access.artisanId`** → `FORBIDDEN` | ✓ **IDOR fermée** (corrige l'ancien `markMessagesAsRead` IDOR) |
| `demanderModification` / `soumettreDemandeIA` / `demanderRdv` | `access.*` + **rate-limit** `checkPortalActionRate(artisanId:clientId)` | ✓ |
| `sendClientMessage` | `access.*` + **rate-limit** `checkChatRate(artisanId:clientId)` | ✓ |

→ **Aucun id d'entité contrôlé par le client n'est utilisé sans vérification d'appartenance.** Les projections renvoient un **sous-ensemble client-safe** (ex. exclusion des `notes` internes). Les mutations publiques sont **rate-limitées** (anti-flood/anti-abus).

## ✅ Conformité au pattern Odoo

Odoo expose les enregistrements au portail via un **`access_token`** par enregistrement et vérifie systématiquement `record.sudo()` borné au token (jamais un id arbitraire). Operioz suit le même principe : **un seul token par client** d'où dérivent `clientId`/`artisanId`, et les sous-ressources (conversation, chantier) sont **re-vérifiées** contre ce client. ✓

---

## 🟢 Réserve LOW (defense-in-depth, pas une faille)

`getDevisByClientId` / `getFacturesByClientId` / `getInterventionsByClientId` scopent par **`clientId` seul** (sans `artisanId`), alors que `getContrats`/`getMesRdv` ajoutent `artisanId`. **Pas de fuite** : `clientId` est la PK auto-incrémentée de `clients` (donc propre à un seul artisan) et provient d'un token validé. Alignement defense-in-depth possible (1 arg) pour cohérence avec le pattern systémique — **non bloquant**, même classe que le hardening `getConflitsTechnicien` (commit `2278e86`).

## Verdict

La surface **publique** du portail client est **correctement cloisonnée** : token validé (actif + non expiré), scoping systématique via `access.clientId`/`access.artisanId`, vérification d'appartenance sur les sous-ressources (conversations/chantiers), projections client-safe, rate-limits sur les mutations. Les anciennes findings (`markMessagesAsRead` IDOR, `getContrats` sur-exposition des notes) sont **confirmées corrigées**. **Aucun ticket** — 1 réserve LOW defense-in-depth (scoping `artisanId` redondant sur 3 lectures, sans fuite réelle).

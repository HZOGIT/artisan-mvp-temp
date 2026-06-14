# Audit — Clients (CRUD principal, PII) — RAS bloquant

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `clientsRouter` (`routers.ts:145`) — l'entité la plus sensible
> (PII : nom, email, téléphone, adresse). **Aucun BLOCKER/HIGH** → pas d'issue.

---

## Ce qui fonctionne correctement — multi-tenant correctement isolé

Toutes les routes passent par la couche **`dbSecure.*Secure`** en lui transmettant
`artisan.id`, et ces helpers **forcent l'appartenance dans le `WHERE`** :

| Route | Helper | Scope |
| -- | -- | -- |
| `list` | `getClientsByArtisanIdSecure(artisan.id)` | ✓ |
| `getById` | `getClientByIdSecure(id, artisan.id)` | ✓ |
| `create` | `createClientSecure(artisan.id, input)` | ✓ |
| `update` | `getClientByIdSecure(id, artisan.id)` puis `updateClientSecure(id, artisan.id, …)` | ✓ (double) |
| `delete` | `getClientByIdSecure(id, artisan.id)` puis `deleteClientSecure(id, artisan.id)` | ✓ |
| `search` | `searchClientsSecure(artisan.id, q)` | ✓ |
| `importFromExcel` | `createClientSecure(artisan.id, …)` | ✓ |

Preuve (le filtre est bien dans la requête, pas seulement un paramètre ignoré) :

```typescript
// db-secure.ts getClientByIdSecure
.where(and(
  eq(clients.id, clientId),
  eq(clients.artisanId, artisanId) // ✅ vérifie l'appartenance
))
```

→ **Pas d'IDOR sur l'entité client.** L'entité PII la plus exposée est protégée.

---

## Enseignement pour la remédiation IDOR (OPE-47)

Ce résultat **renforce et précise** le constat systémique d'OPE-47 : les entités
qui passent par la couche **`dbSecure.*Secure`** (clients, et aussi devis via
`getDevisByIdSecure`, factures via `getFactureByIdSecure`) **sont correctement
isolées**. Le défaut d'isolation multi-tenant concerne **exactement** les entités
qui utilisent le `db.getXById(id)` **brut** sans scope (véhicules, congés,
rapports, photos, écritures…).

→ La remédiation la plus sûre n'est donc pas un patch route-par-route mais
**généraliser le pattern `dbSecure`** (helpers `getXByIdSecure(id, artisanId)`
avec `artisanId` dans le `WHERE`) à toutes les entités, et bannir l'usage direct
de `db.getXById(id)` dans les routeurs.

---

## Conclusion

Le CRUD clients est **sûr** (isolation multi-tenant correcte via `dbSecure`).
Aucun BLOCKER/HIGH. Ce domaine sert de **modèle de référence** pour corriger les
entités vulnérables d'OPE-47.

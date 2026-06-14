# Audit — Recherche globale + statistiques (agrégations) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `searchRouter.global` (`routers.ts:8028-8133`) — recherche transverse
> clients/devis/factures/interventions/fournisseurs ; `statistiquesRouter`
> (`routers.ts:7168-7218`) — `getDevisStats`, `getFacturesStats`, `getCAMensuel`,
> `getTopClients`, `getTauxConversion`.

---

## Conclusion : surfaces scopées tenant, pas d'injection. Pas de BLOCKER/HIGH.

### `search.global` — chaque sous-requête est cloisonnée + paramétrée

La recherche lance **5 requêtes en parallèle** (clients, devis, factures, interventions,
fournisseurs). Toutes :

- résolvent l'`artisanId` **côté serveur** via `getArtisanByUserId(ctx.user.id)`
  (`:8035`) — jamais depuis l'input ;
- portent un **`WHERE artisanId = ?`** explicite (`:8058`, `:8072`, `:8083`, `:8094`,
  `:8105`) → **aucune fuite cross-tenant** sur cet endpoint pourtant transverse (PII
  clients/fournisseurs + montants devis/factures) ;
- utilisent des **placeholders `?`** pour le terme (`like = '%' + q + '%'` passé en
  paramètre, `:8038`) → **pas de SQL injection** malgré le SQL brut ;
- bornent les résultats (`LIMIT 5`/`LIMIT 3`) → pas de DoS par volume ;
- `query` validé `z.string().min(1).max(100)` → entrée bornée.

Le `COLLATE utf8mb4_general_ci` ne sert qu'à l'insensibilité accents/casse (pas de
contournement du scope).

### `statistiquesRouter` — agrégations scopées ctx

Les 5 procédures (`getDevisStats`, `getFacturesStats`, `getCAMensuel`, `getTopClients`,
`getTauxConversion`) résolvent toutes `getArtisanByUserId(ctx.user.id)` puis agrègent sur
**leur propre `artisan.id`**. Les seuls inputs sont `months`/`limit` (numériques
optionnels) — **aucune référence d'`id`** d'entité d'entrée → **pas d'IDOR** possible.

---

## Réserve mineure (non bloquante, pas d'issue)

- `search.global` n'applique **aucun filtre de rôle** : un collaborateur `technicien`
  peut voir, via la recherche, les titres/montants de devis/factures de **son propre
  tenant**. C'est cohérent avec le périmètre intra-tenant (la donnée lui appartient
  organisationnellement) ; le durcissement par rôle relève du confort, pas d'une fuite.
  Le **bypass de permissions par rôle est déjà tracé** ailleurs (router permissions,
  assistant) — pas de doublon.

---

## Verdict

Recherche globale et statistiques : **`artisanId` toujours dérivé du `ctx`**, `WHERE
artisanId = ?` systématique, requêtes **paramétrées** et **bornées**. Pas de fuite
cross-tenant, pas d'injection, pas de DoS. **Pas d'issue Linear.**

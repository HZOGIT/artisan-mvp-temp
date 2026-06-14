# Audit — Sweep injection SQL des requêtes brutes (`pool.execute`) ✅ OK (aucun BLOCKER ; 1 réserve LOW de robustesse)

**Date** : 2026-06-13 · **Projet** : Lancement 30 juin · **Domaine** : sécurité API — raw SQL (`mysql2 pool.execute`)

> Sweep de **toutes** les requêtes SQL brutes (`pool.execute`/`pool.query`) des chemins
> utilisateur (`server/db.ts` ~130, `server/routers.ts` ~11) à la recherche d'**injection SQL** :
> valeurs non paramétrées, et surtout **interpolation de noms de colonnes/clauses** (`${…}`)
> dérivés d'entrées utilisateur. Complète `2026-06-11-raw-sql-pool-execute-tenant-scoping-ok.md`
> (qui couvrait le **scoping tenant**, pas l'injection). ↔ Odoo : ORM paramétré + `psycopg` `%s`.

---

## ✅ Toutes les VALEURS sont paramétrées (`?`)

Aucune valeur utilisateur n'est concaténée dans le SQL : partout `pool.execute("… ? …", [vals])`.
Cas notables vérifiés sains :
- **Recherche dépenses** (`db.ts:6918`) : `LIKE` via **paramètre** `const q = `%${search}%`` passé dans `params`, **pas** interpolé dans la requête. ✓
- **`LIMIT ${safeLimit}`** (`listAiThreads` `:7675`, `listAiMessages` `:7710`) : `safeLimit = Math.max(1, Math.min(100, Math.floor(limit)||20))` → **entier borné** inliné (mysql2 rejette `LIMIT ?`). ✓

## ✅ Les NOMS DE COLONNES interpolés sont tous whitelistés

Le seul vecteur d'injection possible en SQL paramétré = interpoler un **identifiant** (`${col}`) contrôlé par l'utilisateur. Tous les sites dynamiques sont sûrs :

| Fonction (`db.ts`) | Source des colonnes interpolées | Verdict |
|---|---|---|
| `updateDepense` (`:7048`) | `DEPENSE_FIELD_MAP[key]` — **whitelist** (clé inconnue → `continue`) | ✓ |
| `updateSubscription*` (`:4567`) | mapping `sqlCol` (whitelist), valeurs `?` | ✓ |
| `createInterventionMobile` (`:5031`) | boucle sur un tableau **`[…] as const`** d'allowed cols | ✓ |
| `updateInterventionMobile` (`:5085`) | idem (whitelist) | ✓ |
| `updateArtisanOnboarding` (`:4430`) | blocs **`if (data.X !== undefined) sets.push('X = ?')`** codés en dur | ✓ |
| `getDepensesByArtisanId` WHERE (`:6908`) | `conds.push("col = ?")` **codés en dur** + params | ✓ |
| `getTransactionsBancaires` WHERE (`:7560`) | idem (clauses fixes) | ✓ |

## ✅ Upserts « `Object.keys` » — sûrs par stripping Zod (cf. réserve LOW)

`saveConfigurationComptable` (`db.ts:6169`) et `saveConfigAlertePrevision` (`:6741`) construisent `INSERT (${Object.keys(data).join()}) … ON DUPLICATE KEY UPDATE ${k}=VALUES(${k})` — **noms de colonnes interpolés**. Leur sûreté repose sur leurs **uniques appelants** :
- `routers.ts:7896` : `saveConfigurationComptable({ artisanId, ...input })`, `input` = **`z.object({compteVentes, …, actif})`** fixe (`:7878-7893`).
- `routers.ts:8323` : `saveConfigAlertePrevision({ artisanId, ...input })`, `input` = **`z.object({seuilAlertePositif, …, actif})`** fixe (`:8311-8319`).

`z.object()` **supprime les clés inconnues par défaut** (pas de `.passthrough()` ni `z.record()`) → `Object.keys` ne contient **que** les colonnes whitelistées + `artisanId`. **Aucune injection** possible via une clé forgée (elle est strippée avant d'atteindre le SQL). ✓

## ✅ Hors périmètre — `fix-duplicates.ts`

Script de **maintenance/DDL** (133 `pool.execute`) : les identifiants interpolés (`${table}`, `${col}`, `${pk}`) proviennent de **tableaux de config codés en dur**, jamais d'une entrée requête. Non exposé en endpoint. ✓

---

## 🟢 Réserve LOW (robustesse, pas une faille) — dépendance implicite au stripping Zod

Les 2 upserts config sont sûrs **uniquement** parce que leur Zod d'entrée est un `z.object` fixe. C'est un couplage **fragile** : si un futur dev ajoute `.passthrough()`, passe à `z.record()`, ou appelle ces helpers avec des données non validées, l'injection SQL par **nom de colonne** s'ouvre. **Recommandation** (durcissement, non bloquant) : remplacer `Object.keys(data)` par un **whitelist explicite de colonnes** dans `saveConfigurationComptable`/`saveConfigAlertePrevision` (comme `DEPENSE_FIELD_MAP`), pour rendre la sûreté **locale** et indépendante de l'appelant. **Pas d'issue Linear** (aucune exposition actuelle).

---

## Verdict

La surface SQL brute est **correctement paramétrée** : toutes les valeurs via `?`, tous les identifiants dynamiques **whitelistés** (field maps, `as const`, blocs `if` codés en dur) ou **strippés par Zod**, `LIMIT` borné en entier, `LIKE` en paramètre. **Aucune injection SQL** → **aucun BLOCKER/HIGH**, **pas d'issue Linear**. Unique réserve **LOW** : la sûreté des 2 upserts config dépend implicitement du stripping Zod de l'appelant → durcissement recommandé (whitelist local) post-lancement.

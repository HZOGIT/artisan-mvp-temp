# OPE-692 — BDD de test éphémère par worktree

> **Type** : SPIKE (investigation timeboxée → reco + issue d'implémentation). Aucun code de fix
> ici. Demande humaine via le reviewer (2026-06-29).

## 1. Problème vécu

Tous les worktrees partagent **la même base de test** (`artisan_mvp` sur le PG local `:5432`).
Conséquences :

- Une PR qui ajoute une migration n'est **pas isolée** : le reviewer doit l'appliquer **à la main**
  sur `:5432` depuis le worktree. `task db:provision` lancé **du repo principal** applique le
  `drizzle/` du repo principal (sans la migration de la PR) → faux échecs **`column … does not exist`**
  sur le gate L2/L3 (mémoire `test-db-stale-migrations`).
- **Course multi-worktrees** sur le ledger `__migrations` partagé : deux worktrees provisionnant la
  même base avec des `drizzle/` différents corrompent l'état (une migration éditée garde son nom →
  checksum divergent → `runMigrations` lève `checksum différent`).
- Rôle `app_tenant` **cassé** par un mot de passe passé à la main (désynchronisé de `APP_DATABASE_URL`).

## 2. Objectif

Chaque worktree a **sa** base de test : instanciable en **quelques secondes**, **totalement isolée**,
provisionnée avec **les migrations de CE worktree** (son `drizzle/`), **nettoyée automatiquement** en
fin de session.

## 3. Contraintes décisives du contexte

- **RAM / OOM** : crash OOM le **2026-06-29** (84 process node, 22.8 GB / 31 GB), swap porté à 32 GB,
  **plafond DUR de 4 worktrees** (mémoire `oom-crash-swap-remediation`, `pm-worktree-slot-limit`).
  → Toute piste qui **multiplie les instances/clusters PG** (un par worktree) est disqualifiée.
- **Le runner de migrations Option D est déjà par-base.** `provision-cli.ts` → `provisionDatabase()` :
  sous `pg_advisory_lock`, `runMigrations(pool)` applique les `.sql` de `MIGRATIONS_DIR`
  (défaut `drizzle/`) triés par nom, tracés dans le ledger **`__migrations` de CETTE base**, puis
  `ensureAppRole(pool)` (ré)assure le rôle + grants sur `current_database()`. Le rôle `app_tenant`
  est **cluster-level** (existe une fois pour toute l'instance) ; les grants sont par-base.
- **`vitest.setup.api.ts`** dérive `APP_DATABASE_URL` de `DATABASE_URL` en remplaçant les creds par
  `app_tenant:app_tenant_pw`. → Les tests n'ont besoin que d'un **`DATABASE_URL` pointant sur la bonne base**.

**Conséquence clé** : « provision = migrations du worktree courant » est **déjà résolu par l'outil
existant** (`provision-cli.ts`). Il suffit (1) d'une base neuve par worktree, (2) de pointer provision
+ tests dessus, (3) de la `DROP` en fin de session. **Quasi aucun code nouveau côté runner.**

## 4. Évaluation des pistes

| Piste | Instanciation | Isolation | RAM | Cleanup | Complexité | Verdict |
|---|---|---|---|---|---|---|
| **(a) Base par worktree sur l'instance partagée** | quasi-instantanée (TEMPLATE) ou ~qq s (provision à blanc) | totale (catalogue/RLS/données séparés) | **1 seule instance** | `DROP DATABASE … WITH (FORCE)` instantané | faible — réutilise `provision-cli.ts` | ✅ **RETENUE** |
| (b) Conteneur PG jetable par worktree | boot conteneur (s) | totale | **×4 instances → OOM** | `docker rm` | moyenne (ports, lifecycle) | ❌ rejetée |
| (c) Schéma/namespace par worktree | rapide | partielle | 1 instance | `DROP SCHEMA` | **élevée + risquée** | ❌ rejetée |
| (d) tmpfs / pg_tmp | boot cluster (s) | totale | **cluster en RAM → OOM** | auto | moyenne | ❌ rejetée |

### (a) — RETENUE : une base PostgreSQL par worktree sur l'instance `:5432`

- **Isolation totale** : une base PG = catalogue, état RLS, données, ledger `__migrations` séparés.
  C'est l'unité minimale qui supprime la course sur le ledger partagé.
- **RAM** : **une seule instance** PG → respecte le plafond OOM (la contrainte décisive).
- **Provision = migrations du worktree** : on lance le **`provision-cli.ts` existant** avec
  `MIGRATIONS_DIR` = le `drizzle/` du worktree et `DATABASE_URL` = la base neuve. Base neuve = ledger
  vide → mode strict, schéma complet appliqué from-scratch depuis CE `drizzle/`. **Supprime le faux
  `column does not exist`** par construction.
- **Rôle `app_tenant`** : cluster-level (déjà présent) ; `ensureAppRole` re-grant idempotent sur la
  nouvelle base, password dérivé de `APP_DATABASE_URL` → **fin du "mdp cassé à la main"**.
- **Cleanup** : `DROP DATABASE ope_test_<wt> WITH (FORCE)` (PG ≥ 13, on est en PG 18) — instantané,
  même avec connexions résiduelles.

**Vitesse — deux variantes, par paliers (YAGNI) :**
1. **MVP** : `CREATE DATABASE ope_test_<wt> TEMPLATE template0` puis provision à blanc via
   `provision-cli.ts`. Zéro maintenance de baseline. Coût = durée d'une provision complète (toutes
   les migrations) — à mesurer ; probablement « quelques secondes ».
2. **Optimisation (si le MVP est trop lent)** : `CREATE DATABASE ope_test_<wt> TEMPLATE ope_test_baseline`,
   où `ope_test_baseline` est une base **dédiée, jamais servie**, maintenue provisionnée à
   `origin/staging` (rafraîchie par le reviewer après chaque merge de migration). Le clone PG est
   quasi-instantané et porte le ledger du baseline → **seules les migrations *pending* du worktree**
   s'appliquent par-dessus. Contrainte : **aucune connexion active** au template au moment du clone
   (d'où une base baseline dédiée, distincte de toute base de test servie).

### Pistes rejetées (raison)

- **(b) Conteneur PG par worktree** — ×4 instances PG = RAM réelle sur machine OOM-prone (le crash du
  jour). Gestion de ports + lifecycle conteneur. **Aucun gain d'isolation** vs une base séparée sur
  une instance unique. Rejetée pour la RAM et la complexité.
- **(c) Schéma/namespace par worktree** — `runMigrations`, le générateur RLS
  (`scripts/rls/generate-tenant-rls.mjs`) et `ensureAppRole` (`grant … on schema public`) supposent
  tous **`public`** ; isolation par `search_path` = gros refacto risqué du runner et de la RLS.
  Rejetée : risque élevé pour zéro gain vs (a).
- **(d) tmpfs / pg_tmp** — un cluster éphémère sur tmpfs = **RAM** (tmpfs est adossé à la RAM), pire
  que (b) au regard de l'OOM ; + coût de boot d'un cluster. Rejetée pour la RAM.

## 5. Intégration (pour l'issue d'implémentation)

1. **`scripts/launch-claude-bg.sh`** (branche `--worktree`) : après création du worktree, dériver
   `TEST_DB=ope_test_<session>` (sanitizé `[a-z0-9_]`, borné à 63 car. — identifiant PG), `createdb`
   (variante 1 ou 2), puis provision via `provision-cli.ts` avec `MIGRATIONS_DIR` = le `drizzle/` du
   worktree et `DATABASE_URL` → la base neuve. Exposer le `DATABASE_URL` par-worktree à la session
   (écrit dans le worktree, p. ex. `.env.test.local`, pour que vitest le prenne).
2. **`scripts/prompts/_worktree-footer.md`** : remplacer le `localhost:5432/artisan_mvp` codé en dur
   dans les commandes de test par la base du worktree ; **retirer le caveat REGLE 4** sur la migration
   appliquée à la main par le reviewer (devenu inutile).
3. **`scripts/prompts/reviewer-agent.md`** : le gate `vitest` cible le `DATABASE_URL` du worktree (plus
   `artisan_mvp` partagé) ; **supprimer le caveat « PG de test périmé → `task db:provision` »** et
   « appliquer la migration de la PR à la main ». Étape de cleanup : ajouter
   `DROP DATABASE ope_test_<session> WITH (FORCE)` **après** `worktree remove`.
4. **Balayage des orphelins** : au sweep de début de cycle du reviewer, `DROP` les `ope_test_*` dont
   le worktree n'existe plus (filet anti-fuite, symétrique du `worktree prune`).
5. **(variante 2 seulement)** : le reviewer rafraîchit `ope_test_baseline` (drop+recreate+provision à
   `origin/staging`) après chaque merge de migration.
6. **Inchangé** : `artisan_mvp` (`:5432`) + `task db:provision` restent pour le dev local ; les bases
   par-worktree sont **additionnelles**.

## 6. Critères de done — couverture

| Critère du spike | Couvert par (a) |
|---|---|
| Instanciation < quelques s | ✅ TEMPLATE quasi-instantané (variante 2) / provision à blanc (variante 1, à mesurer) |
| Isolation totale | ✅ base PG séparée (catalogue/RLS/données/ledger) |
| Provision = migrations du worktree courant | ✅ `provision-cli.ts` + `MIGRATIONS_DIR` du worktree → supprime le faux `column does not exist` |
| Cleanup auto en fin de session | ✅ `DROP DATABASE … WITH (FORCE)` au teardown reviewer + sweep orphelins |
| Intégration launch/footer/runner/gate | ✅ §5 — points d'ancrage identifiés, runner réutilisé tel quel |

## 7. Recommandation

Implémenter **(a) variante 1 (MVP)** : une base `ope_test_<session>` par worktree, créée et
provisionnée au lancement via le **`provision-cli.ts` existant** pointé sur le `drizzle/` du worktree,
droppée au teardown. **Mesurer** la durée de provision à blanc ; si > quelques secondes, passer à la
**variante 2** (clone `TEMPLATE ope_test_baseline`). Aucune nouvelle dépendance, aucun refacto du
runner — le coût est essentiellement du shell dans `launch-claude-bg.sh` + reviewer.

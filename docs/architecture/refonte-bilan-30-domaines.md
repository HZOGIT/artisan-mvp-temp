# Refonte clean-archi — bilan des 30 domaines

> Bilan de la migration clean-archi post-migration PostgreSQL (legacy Express + tRPC → **Fastify 5 + tRPC 11 + Drizzle node-postgres + PostgreSQL/RLS**). Document de synthèse — clôture le périmètre « 30 domaines » côté **code**. État au 2026-06-14.

## Résultat

- **30 / 30 domaines** ciblés livrés bout-en-bout en clean-archi (`src/modules/*/`).
- Suite de tests : **1424 tests / 255 fichiers** verts (`pnpm exec vitest run src`), gate `pnpm exec tsc -p tsconfig.src.json` vert, e2e PG jetable (rôle `app_tenant` + RLS) verts.
- **Legacy intact, derrière feature flags OFF par défaut** : aucune bascule en production déclenchée par cette run (volet infra réel déféré — voir § Reste à faire).

## Architecture cible (rappel)

Stack : **Fastify 5** (HTTP) + **tRPC 11** (RPC typé) + **Drizzle** (node-postgres) + **PostgreSQL** avec **RLS**.

Chaque domaine suit le même découpage clean-archi :

```
src/modules/<domaine>/
  domain/        # types métier (camelCase), purs, zéro dépendance infra
  application/   # ports (interfaces repo) + use-cases purs (read / write / transitions)
  infra/         # impl Drizzle du repo + fake in-memory (mêmes invariants)
  interface/trpc # routeur tRPC (transport mince : zod → use-case → formatter)
  <domaine>.module.ts  # factory DI (assemble le routeur depuis le repo injecté)
  index.ts             # barrel : domain + port + module ; JAMAIS l'infra
```

Assemblage : `buildApp` (`src/app.ts`) injecte les repos Drizzle par défaut (surchargables en test), monte chaque module dans `createAppRouter` (`src/interface/trpc/router.ts`). Le **gateway** (`src/interface/gateway/`) route legacy↔nouveau stack par domaine selon `FeatureFlags` (OFF par défaut, canary `tenantAllowlist`, global + `tenantDenylist`).

## Recette par domaine (9 étapes)

1. **Scaffold** : domaine + port + module factory + barrel + module.test (stub).
2. **Repository Drizzle + fake** : `withTenant` (RLS) + filtre `artisanId` ; mapper snake_case↔camelCase si besoin ; interception unicité (23505) si contrainte DB.
3. **Read use-cases** : list / by-X / getById (NotFound si null).
4. **Write use-cases** : create / update / delete + validation (`ValidationError`).
5. **Routeur tRPC + câblage** : procédures + bornes zod ; `buildApp` + `createAppRouter` + `MIGRATED_DOMAINS` + `app.test`.
6. **e2e HTTP exhaustif** : HTTP → tRPC → use-case → repo → RLS sur PG jetable (plage d'ids unique par fichier).
7. **Transitions / dérivés** (si applicable) : état-machine + anti-IDOR-FK.
8. **Barrel + invariants de synthèse** : non-fuite infra + revue des invariants métier.
9. **Bascule flag gateway** : routage OFF/canary/denylist + registre des domaines migrés.

## Les 30 domaines

| # | Domaine | Profil | Invariants/particularités clés |
|---|---------|--------|--------------------------------|
| 1 | vehicules | CRUD | isolation, artisanId forcé |
| 2 | avis (+ demande d'avis) | CRUD + workflow + email/rate-limit | demande d'avis (token, anti-oracle), stats publiées |
| 3 | badges | CRUD + attribution | anti-IDOR 2 FK (badge/technicien), idempotence |
| 4 | techniciens | CRUD | isolation |
| 5 | notifications | CRUD/lecture | scoping |
| 6 | fournisseurs | CRUD | anti-IDOR-FK |
| 7 | commandes | CRUD + lignes | totaux, réceptions |
| 8 | stocks | CRUD + mouvements | valorisation |
| 9 | clients | CRUD | PII scoping |
| 10 | interventions | CRUD + état-machine | mobile, signature |
| 11 | conges | CRUD + approbation | anti self-approbation, solde |
| 12 | notesDeFrais | CRUD + approbation | anti self-approbation, lien dépense |
| 13 | chantiers | CRUD + phases | stats |
| 14 | depenses | CRUD + écritures | mass-assignment, FEC achats |
| 15 | devis | CRUD + lignes + transitions | immutabilité post-signature, totaux non falsifiables |
| 16 | factures | CRUD + cycle de vie | immutabilité, numérotation, paiement |
| 17 | ecritures | écritures comptables | **FEC débit=crédit équilibré** |
| 18 | articles | CRUD catalogue | bibliothèque |
| 19 | parametres | get/set | config artisan |
| 20 | modelesEmail | CRUD catalogue | isolation |
| 21 | modelesDevis | CRUD catalogue | isolation |
| 22 | configRelances | get/set | config |
| 23 | rdvEnLigne | CRUD + état-machine | portail public, validation créneau |
| 24 | relancesDevis | CRUD + scheduler | ownership |
| 25 | categoriesDepenses | CRUD catalogue snake_case | **unicité (artisan, nom)** → 23505→Conflict via `.cause` |
| 26 | contratsMaintenance | CRUD + état-machine + référence serveur | anti-IDOR clientId, référence `CTR-xxxxx` |
| 27 | demandesContact | CRUD + état-machine + conversion | anti-IDOR clientId (conversion) |
| 28 | budgetsCategories | CRUD catalogue snake_case | **unicité (artisan, categorie, mois)**, categorie/mois immuables |
| 29 | reglesCategorisation | CRUD catalogue snake_case | sans unicité |
| 30 | previsionsCA | CRUD catalogue camelCase | mois/annee immuables, ecart signé, sans unicité |

> NB : `demandesAvis` n'est **pas** un 31e domaine — la table `demandes_avis` est couverte par le module `avis` (workflow `envoyerDemande`/`envoyerDemandeParClient`). Une tentative de module séparé a été détectée (collision `tsc`) et **revertée proprement** (cf. journal, finding 2026-06-14).

## Invariants transverses préservés

- **Isolation cross-tenant** : double cloisonnement = RLS (rôle `app_tenant` non-superuser + GUC `app.tenant` via `withTenant`, transaction-local) **ET** filtre explicite `eq(table.artisanId, ctx.artisanId)` sur chaque requête. Prouvé par domaine (repo + use-cases + e2e : B → NotFound/[]).
- **`artisanId` forcé** à la création (jamais pris de l'input).
- **Anti-IDOR-FK** : toute FK validée par `ownsX` ; échec → `NotFoundError` (NOT_FOUND uniforme, anti-oracle d'énumération cross-tenant).
- **États-machine** : transitions gardées par table `TRANSITIONS` + helper pur ; états terminaux → `ConflictError` (409).
- **Unicité DB** : contrainte `UNIQUE` → PG `23505` → `ConflictError` ; ⚠️ détection en **remontant la chaîne `.cause`** (Drizzle enveloppe l'erreur pg).
- **Immutabilité métier** : champs identité/clé d'unicité non modifiables par update (devis post-signature, totaux dérivés, categorie/mois, mois/annee…).
- **Comptabilité** : FEC débit=crédit, écritures équilibrées, TVA — invariants conservés (domaines ecritures/depenses/factures).
- **Token serveur** : généré côté serveur (jamais fourni par le client), unique.

## Mapping des erreurs domaine → tRPC (confirmé e2e)

`NotFoundError` → 404 · `ValidationError` → 400 · `ForbiddenError` → 403 · `ConflictError` → 409 · procédure protégée sans session → 401.

## Garde-fous de cohérence

- `MIGRATED_DOMAINS` (`src/interface/gateway/migrated-domains.ts`) = **30** domaines montés.
- `app.test.ts` : chaque domaine de `MIGRATED_DOMAINS` a une `sampleProcedure` répondant **401** (monté ≠ 404).
- `gateway.test.ts` : registre des domaines migrés (**30**) + un `describe` de bascule de flag par domaine.
- Hygiène tests PG : plage d'ids 7 chiffres unique par fichier (série `994xxxx`).

## Métriques

- **30** modules (`src/modules/*/`).
- **1424** tests / **255** fichiers (`src/**`), verts avec PG jetable.
- Gate : `pnpm exec tsc -p tsconfig.src.json` vert.

## Reste à faire (hors périmètre « code des 30 domaines »)

1. **Sweep de cohérence des garde-fous** (test méta) : garantir que `MIGRATED_DOMAINS`, les clés de `createAppRouter`, la map `sampleProcedure` d'`app.test` et le registre `gateway.test` listent **exactement le même** ensemble de 30 (prévention de drift).
2. **Volet infra réel (cutover)** — **déféré à l'humain** (touche `terraform/*` + déploiement) :
   - déployer le stack **Fastify sur staging** (compose) ;
   - créer le rôle `app_tenant` + appliquer `drizzle/rls/tenant-isolation.sql` sur staging PG ;
   - définir `APP_DATABASE_URL` (rôle app non-superuser) ;
   - bascule **progressive** des flags `canary → cutover` par domaine via le proxy Cloudflare (`functions/api/[[path]].js`) : **catalogues non sensibles d'abord** (articles, categoriesDepenses, budgetsCategories, reglesCategorisation, previsionsCA), **sensibles en dernier** sous double-run/comparaison (factures, ecritures/FEC, devis, TVA).
3. **Dette résiduelle / findings** : suivis en commentaires sur l'issue Linear OPE-276 (quota free-tier atteint pour la création d'issues).

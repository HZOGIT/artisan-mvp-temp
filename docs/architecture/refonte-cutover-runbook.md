# Refonte clean-archi — runbook de cutover (legacy → nouveau stack)

> Procédure **ordonnée, idempotente, réversible** pour basculer le trafic du stack legacy (Express + tRPC sur la base) vers le nouveau stack clean-archi (**Fastify + tRPC 11 + Drizzle node-pg + RLS**), domaine par domaine, derrière les feature flags du gateway.
>
> ⚠️ **Exécution = opération infra/déploiement** (touche `terraform/*`, le déploiement Fastify et la config Cloudflare). Ce volet est **délégué à l'humain** : il n'est PAS exécuté ni committé par la run autonome. Ce document décrit *quoi* faire et *dans quel ordre*.

## Pré-requis (état actuel)

- Périmètre **code** clos : **30 domaines** clean-archi, suite **1427 tests / 256 fichiers** verts, gate `tsc -p tsconfig.src.json` vert.
- Les deux stacks lisent **la même base PostgreSQL** (post-migration PG). Aucune migration de données au cutover → **rollback instantané** (cf. § 6).
- Legacy reste la route par défaut : tous les flags sont **OFF** tant qu'on ne les bascule pas.

## Principe de routage (rappel)

Le gateway décide legacy↔nouveau stack par domaine (`src/interface/gateway/`), piloté par variables d'environnement :

- `NEW_STACK_DOMAINS="articles,categoriesDepenses"` → ces domaines **enabled globalement** sur le nouveau stack.
- `NEW_STACK_CANARY_<DOMAINE>="12,34"` → **allowlist** de tenants (canary) pour `<DOMAINE>` (⚠️ le suffixe est lowercasé par le parseur → ne fonctionne **que** pour les domaines en minuscules ; pour un domaine camelCase, passer par `NEW_STACK_DOMAINS` + un denylist géré côté flags applicatifs).
- Priorité de décision (`router-decision.ts`) : **denylist** (exclut) > **allowlist** (inclut) > **enabled** global > défaut OFF (legacy).

## Procédure

### 1. Déployer le stack Fastify sur staging (à côté du legacy)
- Construire et lancer le service Fastify du nouveau stack via compose (staging), **sans** couper le legacy.
- Health : `GET /health` → `200 {status:"ok"}` ; `GET /api/trpc/health` → `200`.

### 2. Rôle DB `app_tenant` + RLS sur staging PG
- Créer/configurer le rôle **`app_tenant`** (LOGIN, **nosuperuser**, **nobypassrls**) :
  `node scripts/rls/setup-app-role.mjs` (idempotent — vérifie `superuser=false`, `bypassrls=false`).
- Appliquer les policies : `drizzle/rls/tenant-isolation.sql` sur **staging PG** (safe : exécuté en superuser, qui bypasse RLS ; n'impacte pas le legacy qui se connecte en superuser).
- Vérifier qu'aucune table migrée n'est oubliée (les 30 domaines doivent avoir leur `enable/force row level security` + policy sur `artisanId`/`artisan_id`).

### 3. Configurer `APP_DATABASE_URL`
- Définir `APP_DATABASE_URL` (connexion **rôle `app_tenant`** non-superuser) dans l'env du **nouveau stack uniquement**.
- Le legacy garde `DATABASE_URL` (superuser, bypasse RLS) → inchangé.
- `getDbHandle()` du nouveau stack préfère `APP_DATABASE_URL` → toutes les requêtes passent sous RLS.

### 4. Smoke test par domaine (avant toute bascule de trafic réel)
Pour chaque domaine candidat, sur le nouveau stack :
- procédure de lecture (`<domaine>.list` / `.get`) **sans cookie** → **401** ;
- **avec** un JWT valide d'un tenant de test → **200** + données **scopées** à ce tenant ;
- créer/lire/supprimer une ressource jetable et vérifier l'**isolation cross-tenant** (un 2e tenant ne voit rien → `[]`/404).

### 5. Bascule progressive des flags (canary → global → cutover)
Ordre **du moins sensible au plus sensible**. Pour chaque domaine : **canary 1 tenant pilote → élargir → enabled global**, en surveillant logs/erreurs/latence à chaque palier.

**Vague 1 — catalogues / lecture, risque faible** :
`articles`, `categoriesDepenses`, `budgetsCategories`, `reglesCategorisation`, `previsionsCA`, `modelesEmail`, `modelesDevis`, `parametres`, `configRelances`.

**Vague 2 — CRUD métier + états-machine, risque moyen** :
`vehicules`, `techniciens`, `fournisseurs`, `clients`, `chantiers`, `stocks`, `commandes`, `notifications`, `badges`, `avis`, `rdvEnLigne`, `relancesDevis`, `contratsMaintenance`, `demandesContact`, `interventions`.

**Vague 3 — sensibles (financier / RH / conformité), risque élevé → en DERNIER, sous double-run + comparaison de sorties** :
`conges`, `notesDeFrais` (⚠️ **anti self-approbation** + soldes), `depenses`, `devis` (⚠️ immutabilité post-signature, totaux), `factures` (⚠️ numérotation, immutabilité, paiement), `ecritures` (⚠️ **FEC débit=crédit équilibré**), + tout calcul **TVA**.
Pour la vague 3 : router en **canary sur un tenant pilote**, exécuter legacy et nouveau stack en parallèle (double-run) et **comparer les sorties** (montants, numéros, écritures, équilibre FEC) avant d'élargir.

### 6. Rollback (par domaine, instantané)
- Repasser le flag du domaine à **OFF** (retirer de `NEW_STACK_DOMAINS` / vider l'allowlist, ou l'ajouter au denylist).
- Le legacy **reprend la main immédiatement** : **aucune migration de données** (les 2 stacks lisent la même PG), donc pas de réconciliation.
- Aucune action DB nécessaire au rollback.

## Critères de réussite (par domaine)
- Smoke test vert (401/200/isolation).
- Parité fonctionnelle observée (mêmes résultats que legacy ; pour la vague 3, parité **bit-à-bit** sur les montants/numéros/écritures).
- Pas de hausse d'erreurs/latence à l'élargissement.

## Garde-fous already en place (code)
- `MIGRATED_DOMAINS` (registre gateway) = 30 ; `src/interface/registre-coherence.test.ts` garantit registre == domaines montés (anti-drift).
- `app.test` : chaque domaine migré répond 401 (monté ≠ 404).
- e2e PG par domaine (isolation cross-tenant, validations, états-machine, anti-IDOR).

## Reste / suivi
- Dette résiduelle & findings : commentaires sur l'issue Linear **OPE-276** (quota free-tier atteint pour la création d'issues).
- Proxy Cloudflare : `functions/api/[[path]].js` (point de bascule côté edge si retenu).

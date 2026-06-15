# Refonte clean-archi — runbook de cutover (legacy → nouveau stack)

> ✅ **CUTOVER RÉALISÉ (mise à jour 2026-06-15) — ce runbook est HISTORIQUE.** Le **stack est désormais
> unique : Fastify + tRPC 11 + Drizzle pg + RLS** ; le legacy Express est **éteint** (dispatcher edge
> mono-stack — tout `/api/*` → new-stack ; services `app`+`mysql` retirés des composes dev & staging ;
> code `server/` supprimé ; `mysql2` retiré). La bascule progressive par feature flags décrite
> ci-dessous (et le « gap dispatcher » de 2026-06-14) appartient au PASSÉ : le dispatcher a été câblé
> puis simplifié en mono-stack (cf. `refonte-clean-archi-journal.md`, phases C4→C5c). Reste, côté infra
> humaine : retirer le DNS/ingress Cloudflare `staging-backend.operioz.com` (Terraform, déjà sans
> consommateur). Le contenu ci-dessous est conservé comme trace de la procédure de bascule.

> Procédure **ordonnée, idempotente, réversible** pour basculer le trafic du stack legacy (Express + tRPC sur la base) vers le nouveau stack clean-archi (**Fastify + tRPC 11 + Drizzle node-pg + RLS**), domaine par domaine, derrière les feature flags du gateway.
>
> ⚠️ **Exécution = opération infra/déploiement** (touche `terraform/*`, le déploiement Fastify et la config Cloudflare). Ce volet est **délégué à l'humain** : il n'est PAS exécuté ni committé par la run autonome. Ce document décrit *quoi* faire et *dans quel ordre*.

## Pré-requis (état actuel)

- Périmètre **code** clos : **30 domaines** clean-archi, suite **1427 tests / 256 fichiers** verts, gate `tsc -p tsconfig.src.json` vert.
- Les deux stacks lisent **la même base PostgreSQL** (post-migration PG). Aucune migration de données au cutover → **rollback instantané** (cf. § 6).
- Legacy reste la route par défaut : tous les flags sont **OFF** tant qu'on ne les bascule pas.

## ⚠️ Gap d'intégration identifié (2026-06-14) — le dispatcher de bascule n'est PAS encore câblé

État réel vérifié dans le code :

- La **logique de décision** du gateway existe et est **unit-testée** (`src/interface/gateway/` : `shouldRouteToNewStack`, `domainFromTrpcPath`, `parseFlagsFromEnv`) — mais elle **n'est invoquée nulle part dans un chemin de requête runtime** (zéro usage hors définitions + tests). C'est une **brique pure, prête à brancher**, pas un routeur actif.
- L'edge `functions/api/[[path]].js` est un **proxy transparent** vers **un seul** backend (`staging-backend.operioz.com`) — il ne lit aucun flag et ne fait **aucun** routage par domaine.

⇒ **Avant la bascule, il manque un *dispatcher* legacy↔nouveau stack** qui, pour chaque requête `/api/trpc/<domaine>.*`, calcule `domainFromTrpcPath(path)` → `shouldRouteToNewStack(domaine, tenantId, parseFlagsFromEnv())` et **forwarde vers le bon backend**. Options (à décider par l'humain) :
  - **(a) Edge** : enrichir `functions/api/[[path]].js` pour router vers `BACKEND_LEGACY` ou `BACKEND_NEWSTACK` selon le flag (⚠️ le `tenantId` n'est pas trivialement disponible à l'edge avant auth → canary par tenant difficile ; convient pour un flag **global** par domaine) ;
  - **(b) Backend reverse-proxy** : un service en amont (ou middleware Fastify/Express) qui a accès au `ctx.tenant` après auth et proxifie vers l'autre stack pour les domaines non encore migrés / non flaggés (permet le **canary par tenant**) ;
  - **(c) Mono-backend** : monter les deux routeurs dans un même process et trancher par middleware avant le handler (le plus simple à observer, mais couple les deux stacks).

Tant que ce dispatcher n'est pas en place, les § 5 ci-dessous décrivent la **cible**, pas un mécanisme déjà actif.

## Principe de routage (rappel)

La **logique** du gateway décide legacy↔nouveau stack par domaine (`src/interface/gateway/`), pilotée par variables d'environnement (⚠️ **décision pure — à brancher dans le dispatcher, cf. gap ci-dessus**) :

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
**Pré-requis** : le dispatcher de bascule doit être en place (cf. § « Gap d'intégration ») — c'est **lui** (et non le proxy edge transparent actuel) qui consomme `NEW_STACK_DOMAINS`/`NEW_STACK_CANARY_*` pour aiguiller chaque domaine vers legacy ou nouveau stack. Ordre **du moins sensible au plus sensible**. Pour chaque domaine : **canary 1 tenant pilote → élargir → enabled global**, en surveillant logs/erreurs/latence à chaque palier.

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
- Proxy Cloudflare : `functions/api/[[path]].js` — **actuellement proxy transparent** vers un backend unique ; deviendra le point de bascule edge **uniquement si** l'option (a) du § « Gap d'intégration » est retenue (sinon le dispatch se fait côté backend, options (b)/(c)).
- **Action préalable au cutover (à cadrer/implémenter par l'humain)** : le **dispatcher legacy↔nouveau stack** (cf. § Gap) — la logique de décision (`src/interface/gateway/`) est prête et testée, mais son intégration dans le chemin de requête reste à faire.

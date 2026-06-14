# OPE-184 — Analyse de la stack actuelle & proposition d'architecture cible

> **Statut** : proposition — **prêt pour review**
> **Projet** : Refonte progressive de la stack et de l'architecture
> **Date** : 2026-06-12 · **Auteur** : architecture
> **Périmètre** : backend (le front React n'est pas refait, mais son couplage est analysé)

---

## 0. Résumé exécutif (TL;DR)

L'application est un **monolithe Node/TypeScript** Express + tRPC, MySQL + Drizzle, hébergé sur Railway derrière Cloudflare. Le code métier est concentré dans **deux fichiers géants** : `server/routers.ts` (10 081 lignes, 432 procédures) et `server/db.ts` (7 154 lignes, 425 fonctions). La base compte **84 tables**.

Le **point de douleur n°1 n'est pas le framework** : c'est l'**absence de frontière de tenant**. L'isolation multi-tenant est réimplémentée à la main dans chaque handler (`getArtisanByUserId` + check d'ownership), ce qui produit une **classe systémique d'IDOR** — documentée dans **24 audits `*-idor*`** et un constat transverse de **81 handlers sans `ctx`**. Une refonte qui ne corrige pas *structurellement* ce point ne sert à rien.

**Recommandations principales :**

| Sujet | Recommandation | Confiance |
| --- | --- | --- |
| Framework backend | **Fastify** (Node), garder **tRPC** via l'adapter Fastify | Élevée — sauf décision « edge-first » qui basculerait vers Hono |
| Base de données | **PostgreSQL confirmé** ; bascule MySQL→PG **en phase 0**, avant la refonte applicative | Élevée |
| ORM | **Garder Drizzle**, basculer le dialecte `mysql` → `pg` | Élevée |
| Architecture | **Modular Monolith** à influence hexagonale ; **tenant scoping au niveau du repository** + **RLS Postgres** en défense en profondeur | Élevée |
| Tests | **Garder Vitest** ; unit par use-case (repo mocké) + intégration sur Postgres jetable (Testcontainers) + **suite d'isolation cross-tenant comme gate CI** | Élevée |
| CI/CD | **À créer** (inexistant aujourd'hui) — prérequis bloquant de la migration | Élevée |
| Migration | **Strangler fig** par domaine, **DB unique partagée** (pas de dual-write), bascule pilotée par le proxy déjà en place | Moyenne sur le séquencement, élevée sur le principe |

**Estimation globale très grossière : ~22–34 semaines** (1 à 2 devs), dont ~4–6 semaines de bascule DB (phase 0). Détail en §3.6. Ces chiffres sont des ordres de grandeur, pas un engagement.

---

# Étape 1 — Audit de la stack actuelle

## 1.1 Framework(s) backend

- **Runtime** : Node.js (image `node:22-slim`), ESM (`"type": "module"`), TypeScript `5.9` en `strict`.
- **HTTP** : **Express 4.21** (`server/_core/index.ts`, 1 764 lignes) — un seul `app` qui monte :
  - le middleware tRPC sur `/api/trpc` ;
  - **~40 routes REST Express à la main** pour tout ce que tRPC ne couvre pas : upload logo (`multer`), génération/streaming PDF, exports comptables (FEC, Factur-X, CSV), webhook Stripe (raw body), `iCal`, et l'**assistant IA en SSE** (`/api/assistant/stream`).
- **API applicative** : **tRPC 11** (`@trpc/server`), transformer `superjson`. Un **unique `appRouter`** agrège **48 sous-routers** (`artisanRouter`, `clientsRouter`, `devisRouter`, `facturesRouter`, `comptabiliteRouter`, …) — **tous définis dans un seul fichier `server/routers.ts` de 10 081 lignes** totalisant **432 procédures** (`.query`/`.mutation`).
- **Build** : `vite build` (front) + `esbuild` (bundle serveur ESM). Dev via `tsx watch`.
- **Tâches planifiées** : un `runScheduler` **in-process** (`setInterval` horaire, prod uniquement, `index.ts:1756`) qui traite relances de devis, factures récurrentes, prévisions, alertes et dépenses récurrentes. Mono-process, pas de file d'attente, idempotence « best effort » (cf. audit `scheduler-emails-idempotence`).

**Pattern dominant** : routeur tRPC → appel direct des fonctions de `db.ts`/`db-secure.ts`. Pas de couche service/use-case intermédiaire. La logique métier (calculs TVA, numérotation, transitions de statut, double-facturation…) vit **dans les handlers** et/ou **dans `db.ts`**.

## 1.2 Base de données

- **Moteur** : **MySQL 8.0** (`mysql2/promise`, pool maison dans `db.ts:131`).
- **ORM** : **Drizzle** (`drizzle-orm/mysql2`), schéma unique `drizzle/schema.ts` (**1 764 lignes, 84 tables `mysqlTable`**).
- **Migrations** : `drizzle-kit` — 16 migrations versionnées (`0000_baseline.sql` de 45 Ko + 15 incréments). **Appliquées au démarrage du conteneur** (`drizzle-kit migrate` dans le `command` Docker), pas via un pipeline dédié.
- **Domaines couverts par les 84 tables** (regroupement logique) :
  - **Cœur facturation** : `clients`, `devis`(+`devis_lignes`,`devis_options`,`signatures_devis`,`relances_devis`), `factures`(+`factures_lignes`,`factures_recurrentes`), `articles_*`, `bibliotheque_articles`, `modeles_devis*`.
  - **Comptabilité** : `ecritures_comptables`, `plan_comptable`, `exports_comptables`, `configurations_comptables`, `previsions_ca`, `historique_ca`.
  - **Terrain** : `interventions*`, `chantiers`(+`phases_`,`documents_`,`suivi_`), `techniciens`(+`positions_`,`disponibilites_`,`classement_`,`objectifs_`,`badges_`), `vehicules`(+`entretiens_`,`assurances_`,`historique_kilometrage`).
  - **Achats/stock** : `fournisseurs`, `commandes_fournisseurs`(+lignes), `stocks`, `mouvements_stock`.
  - **Relation client** : `contrats_maintenance`, `rdv_en_ligne`, `avis_clients`, `demandes_avis`, `demandes_contact`, `client_portal_*`.
  - **Plateforme** : `users`, `artisans`, `parametres_artisan`, `permissions_utilisateur`, `sessions`, `paiements_stripe`, `audit_log`, `notifications*`, `push_subscriptions`, IA (`ai_threads`, `ai_messages`, `conversations`, `messages`, `*_analyse_ia`).
- **Multi-tenant** : modèle à **colonne `artisanId`** (un `artisan` = un tenant ; les `users` appartiennent à un artisan). **Aucune contrainte au niveau base** ne garantit le cloisonnement — tout repose sur le code applicatif.

## 1.3 Authentification

- **Mécanisme réel** : **JWT maison** signé avec `jose` (HS256, `server/_core/auth-simple.ts`), déposé dans un **cookie httpOnly** (`token`, 7 j). Mots de passe hachés via **bcryptjs**. L'algorithme est épinglé (`algorithms: ["HS256"]`) — bon réflexe.
- **Autorisation** : rôles (`admin` / `artisan` / `secretaire` / `technicien`) + permissions granulaires (`permissions_utilisateur`, `shared/permissions.ts`), exposés via des middlewares tRPC (`protectedProcedure`, `adminProcedure`, `requireRole`, `requirePermission`, `devisVoirProcedure`…) dans `server/_core/trpc.ts`.
- **JWT stateless = pas de révocation** : une table `sessions` existe mais le chemin d'auth ne la consulte pas pour invalider un token (cf. audit `sessions-jwt-revocation`). Déconnexion = suppression du cookie côté client uniquement.
- **Dépendances mortes / redondantes** (à nettoyer) :
  - **`lucia` + `@lucia-auth/adapter-mysql`** : **zéro usage** dans `server/`, `client/`, `shared/`.
  - **`@clerk/backend` + `@clerk/clerk-react`** : référencés uniquement dans un **CSP commenté** (`index.ts:176`) et des `.env` — **non câblés** dans le flux d'auth réel.
  - **`bcrypt` ET `bcryptjs`** présents en parallèle (seul `bcryptjs` est utilisé dans `auth.ts`/`auth-simple.ts`).

> Conclusion auth : le mécanisme effectif est **simple et maîtrisable** (JWT + cookie + bcrypt). Les deux SDK d'auth tiers sont du bruit à supprimer. La **révocation de session** est le vrai manque fonctionnel.

## 1.4 Infrastructure

- **Prod** : **Railway** (build Nixpacks, variables injectées par le dashboard ; cf. `.env.production`, `nixpacks.toml`, enregistrements `_railway-verify` dans `terraform/dns.tf`).
- **Edge / réseau** : **Cloudflare** géré en **Terraform** (`terraform/*.tf`) — zone `operioz`, **Cloudflare Pages** sert le front, une **Pages Function** (`functions/api/[[path]].js`) **proxifie `/api/*`** vers le backend (même origine → cookies host-only sans CORS), et un **tunnel Zero Trust (`cloudflared`)** expose le backend staging.
- **Staging** : `docker-compose.staging.yml` (MySQL + app en build prod + `cloudflared`) sur une VM, derrière le tunnel. Dev : `docker-compose.yml` (MySQL + app `tsx watch`).
- **GCP** : un module Terraform `terraform/gcp/` dédié à **Gemini** (l'assistant IA utilise `@google/genai`).
- **Services tiers** : **Stripe** (abonnements + webhook), **Resend** (emails), un **SMS service**, **AWS S3** (`@aws-sdk/client-s3`, uploads/photos).
- **CI/CD** : ⚠️ **inexistant**. Aucun workflow GitHub Actions pour l'app (`.github/workflows` n'existe pas ; seul le sous-module `odoo-ref` en a). Pas de lint/test/build gating avant déploiement. Les **migrations s'exécutent au boot du conteneur**, ce qui est risqué (migration longue ou échouée = app down, pas de séparation migrate/deploy).

## 1.5 Tests

- **Framework** : **Vitest 2** (`vitest.config.ts`, environnement `node`).
- **Volume** : **354 cas** (`it`/`test`) répartis sur **20 fichiers**, mais **organisés par “sprint”** (`sprint7.test.ts` … `sprint20.test.ts`) plutôt que par domaine — difficile de savoir ce qui couvre quoi.
- **Nature** : majoritairement **tests d'intégration frappant une vraie base MySQL** (ils importent `db-secure`, créent des données réelles avec des **`artisanId` codés en dur** `1`/`2`). Très **peu de mocks** (7 fichiers utilisent `vi.mock`). La valeur réelle est concentrée sur l'**isolation multi-tenant** (`security.test.ts`, `tests/isolation-multi-tenant.test.ts`).
- **Manques** :
  - **Pas de couverture mesurée** (aucune config coverage), pas de seuil.
  - **Pas de tests unitaires de logique métier isolée** (impossible : la logique est noyée dans `db.ts`/handlers).
  - **Pas d'exécution en CI** → les tests ne protègent rien automatiquement.
  - Dépendance à une DB partagée avec IDs fixes = fragilité et ordre d'exécution implicite.

## 1.6 Structure du code & couplages

```
server/
  _core/        index.ts(1764) trpc.ts auth*.ts context.ts assistant*.ts pdfGenerator.ts emailService.ts ...
  routers.ts    ← 10 081 lignes, 48 sous-routers, 432 procédures
  db.ts         ← 7 154 lignes, 425 fonctions (couche d'accès « non scopée »)
  db-secure.ts  ← 586 lignes (couche « scopée tenant », démarrée puis abandonnée)
  stripe/       webhookHandler.ts stripeService.ts products.ts
  *.test.ts     20 fichiers
shared/         schema (zod), permissions, const, errors  ← partagés front/back
client/src/     ~59 000 LOC React 19 (tRPC client, TanStack Query, wouter, Radix/shadcn, Tailwind 4)
drizzle/        schema.ts(84 tables) + 16 migrations
```

**Couplages visibles :**

1. **Deux couches d'accès données parallèles et incohérentes.** `db-secure.ts` a été créé pour ajouter l'isolation tenant (« STRATÉGIE DE MIGRATION : … remplacer progressivement dans db.ts »), mais le chantier est **abandonné à ~4 %** : dans `routers.ts`, on compte **43 appels `dbSecure.*`** contre **1 076 appels `db.*`**. Selon le handler, la même entité est lue de façon scopée *ou non*.

2. **Tenant scoping recopié dans chaque handler.** Pattern répété ~×100 :
   ```ts
   const artisan = await db.getArtisanByUserId(ctx.user.id);
   if (!artisan) throw new TRPCError({ code: "NOT_FOUND", ... });
   const client = await dbSecure.getClientByIdSecure(input.id, artisan.id);
   ```
   Oublier une ligne = faille. Beaucoup de helpers de `db.ts` ne filtrent que par `id` (`getVehiculeById(id) → where(eq(vehicules.id, id))`, **sans `artisanId`**).

3. **Front couplé au back par les types tRPC.** Le client importe `AppRouter` → tout changement de signature côté serveur impacte le front à la compilation. C'est un atout (type-safety bout en bout) **et** une contrainte (la frontière d'API n'est pas versionnée/découplée).

4. **`shared/` partagé front+back** (zod schemas, permissions) : couplage volontaire mais qui lie les deux cycles de vie.

5. **Effets de bord dispersés** : emails, SMS, Stripe, S3, PDF, Gemini sont appelés directement depuis les handlers/`db.ts`, sans port d'abstraction → tests difficiles, retries/idempotence ad-hoc.

## 1.7 Points de douleur — synthèse priorisée

| # | Douleur | Preuve concrète | Gravité |
| --- | --- | --- | --- |
| 1 | **IDOR systémique / pas de frontière de tenant** | 24 audits `*-idor*` ; 81 handlers `async ({ input })` sans `ctx` ; `db.getVehiculeById(id)` non scopé ; FK `clientId` non validée à la création → **dump PII cross-tenant** (`clientid-non-valide-fuite-pii-systemique`) | 🔴 Critique |
| 2 | **God files** | `routers.ts` 10k lignes / `db.ts` 7k lignes / 425 fonctions | 🔴 Élevée |
| 3 | **Double couche données incohérente** | 43 `dbSecure.*` vs 1 076 `db.*` | 🔴 Élevée |
| 4 | **Aucune CI/CD** | pas de `.github/workflows` app ; migrations au boot | 🟠 Élevée |
| 5 | **Logique métier non isolée / non testable unitairement** | calculs TVA, numérotation, double-billing dans handlers/`db.ts` (audits `contrats-factures-recurrentes-double-billing`, `numerotation-factures`, `calcul-montants-tva`) | 🟠 Moyenne |
| 6 | **Scheduler in-process non robuste** | `setInterval` mono-process, idempotence best-effort | 🟠 Moyenne |
| 7 | **Pas de révocation de session** | JWT stateless, `sessions` non consultée | 🟠 Moyenne |
| 8 | **Dépendances mortes** | `lucia`, `@lucia-auth/adapter-mysql`, Clerk non câblé, `bcrypt`+`bcryptjs` | 🟡 Faible |
| 9 | **Tests organisés par sprint, sans couverture, hors CI** | 20 fichiers `sprintN.test.ts`, IDs en dur | 🟡 Faible |

## 1.8 Volume à migrer (ordre de grandeur)

| Élément | Quantité |
| --- | --- |
| Procédures tRPC | **432** (48 sous-routers) |
| Routes REST Express | ~40 |
| Tables | **84** |
| Fonctions d'accès données | **425** (`db.ts`) + ~30 (`db-secure.ts`) |
| LOC backend (hors tests) | ~26 700 (dont `routers.ts` 10k + `db.ts` 7k) |
| Tests existants | 354 (à reconstruire en grande partie) |
| Domaines métier distincts | ~12–15 (cf. §1.2) |

> Le back « utile à migrer » se résume à **~18k lignes** (`routers.ts` + `db.ts`) à redécouper. Le front (~59k LOC) **n'est pas réécrit** mais devra suivre les changements de contrat d'API.

---

# Étape 2 — Analyse des options cibles

## 2.1 Framework backend — Fastify vs Hono

### Critères face au contexte réel du projet

Le backend a des besoins **Node-bound** non négociables à court terme : `mysql2`/Drizzle (puis `pg`), **pool de connexions** persistant, **scheduler in-process**, **AWS S3 SDK**, **génération PDF** (`jspdf`), **streaming SSE** pour l'assistant, **raw body** pour le webhook Stripe, **multipart** (`multer`). Cela disqualifie de fait un déploiement *edge/Workers* sans une réécriture profonde des dépendances.

| Critère | **Fastify** | **Hono** |
| --- | --- | --- |
| Perf (Node) | Très élevée (parmi les + rapides sur Node) | Très élevée également ; avantage marginal côté edge |
| Runtime | Node-first (Bun/Deno ok) | **Multi-runtime** (Workers/Deno/Bun/Node) — son vrai atout |
| Écosystème | **Mature** : `@fastify/multipart`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/helmet`, hooks, DI léger | Plus jeune, minimaliste ; middlewares à assembler soi-même |
| Validation/schéma | Schéma JSON natif (mais on garde zod via tRPC) | Via `@hono/zod-validator` |
| Adapter tRPC | `@trpc/server/adapters/fastify` officiel, SSE/subscriptions ok | `@hono/trpc-server` existe mais moins éprouvé sur SSE/upload |
| Adéquation clean archi | Excellente (hooks = points d'injection nets, plugins encapsulés) | Bonne aussi (handlers fins), mais moins d'outillage transverse |
| Maturité / communauté | Très large, LTS, gros acteurs | En forte croissance, surtout côté edge |
| Migration depuis Express | Faible friction (mêmes concepts) ; `@fastify/express` possible en transition | Modèle Web `Request/Response` différent → réécriture des ~40 routes REST |

### Recommandation : **Fastify** (confiance élevée)

Raisons :
1. La stack est et restera **Node** (Railway, dépendances natives) → l'argument différenciant de Hono (l'edge) **ne s'applique pas** sans un second chantier (porter S3/PDF/scheduler/DB hors process Worker).
2. **tRPC est conservé** (voir ci-dessous) et son **adapter Fastify est de premier rang**, y compris pour le **SSE** de l'assistant et l'upload.
3. L'**écosystème de plugins** Fastify couvre directement nos besoins (multipart, rate-limit déjà identifié dans les audits, cookie, helmet/CSP), là où Hono demande plus d'assemblage.
4. **Transition douce depuis Express** : `@fastify/express` permet de monter temporairement des routes Express existantes pendant le strangling.

> **Quand choisir Hono à la place** : si une décision produit acte un **futur edge-first** (tout le backend sur Cloudflare Workers, cohérent avec le front déjà sur Pages). Dans ce cas, il faut d'abord résoudre : DB accessible depuis Workers (Hyperdrive + Postgres), remplacement du scheduler par **Cron Triggers**, S3 → **R2**, PDF en service séparé. C'est un **choix d'infrastructure**, pas seulement de framework — à trancher explicitement, pas par défaut. **Tant que ce n'est pas tranché, Fastify est le bon pari.**

### tRPC : garder ou non ?

**Garder tRPC.** Le front (59k LOC) en dépend (type-safety bout en bout, TanStack Query). Le retirer imposerait une réécriture front massive sans valeur immédiate. tRPC est **compatible clean architecture** à condition de le traiter comme une **couche transport mince** : le routeur tRPC appelle un **use-case**, il ne contient pas de logique. On bascule simplement l'adapter Express → Fastify.

## 2.2 Base de données — PostgreSQL & ORM

### Confirmer PostgreSQL : **oui** (confiance élevée)

Au-delà de la préférence d'équipe, Postgres apporte ici des leviers **structurellement utiles** :
- **Row-Level Security (RLS)** : permet d'imposer le filtre `artisan_id = current_tenant` **au niveau de la base**, en **défense en profondeur** contre la classe d'IDOR n°1. MySQL n'a pas d'équivalent natif. **C'est l'argument décisif.**
- `jsonb`, index partiels/expression, `CHECK`/contraintes d'exclusion, types riches (numeric exact pour les montants TTC/HT — pertinent vu les audits TVA/CA), meilleures transactions.
- Écosystème migration/observabilité mûr.

MySQL ne nous bloque sur rien aujourd'hui ; mais comme une refonte est de toute façon engagée, **Postgres est le bon socle cible**.

### ORM : **garder Drizzle**, dialecte `pg` (confiance élevée)

| Option | Verdict |
| --- | --- |
| **Drizzle (pg)** | ✅ **Recommandé.** Déjà en place et maîtrisé. SQL-first, sans codegen/daemon, types inférés → s'intègre proprement dans un **pattern repository** (un repo encapsule les requêtes Drizzle). Migration = surtout **changer le dialecte** `mysqlTable`→`pgTable` + ajustements de types. |
| Prisma | ❌ pour ce projet : couche d'abstraction plus lourde, codegen, moins naturel pour du SQL fin et du RLS ; réécriture totale du schéma. |
| Kysely | 🟡 Excellent query builder, mais pas de gestion de schéma/migrations intégrée → on perdrait l'acquis Drizzle pour un gain marginal. |

Garder Drizzle **minimise le risque** : c'est le même outil des deux côtés du strangling, et le schéma converti sert **à la fois** l'ancien stack (phase 0) et le nouveau.

### Stratégie de migration des données MySQL → Postgres

84 tables fortement reliées par FK **inter-domaines** (`devis`↔`factures`↔`clients`↔`compta`↔`contrats`). Un découpage de la DB par domaine est **impraticable** → on migre la base **en une fois, en phase 0**, *avant* de toucher au framework :

1. **Convertir le schéma** `drizzle/schema.ts` de `mysql` vers `pg` : `int autoincrement`→`serial/identity`, `datetime`→`timestamptz`, `tinyint(1)`→`boolean`, `enum` MySQL→`enum` PG ou `text`+`CHECK`, collation/charset, `ON UPDATE CURRENT_TIMESTAMP`→trigger ou applicatif.
2. **Régénérer la baseline** Drizzle pour Postgres.
3. **Copier les données** (outil type `pgloader`, ou export/transform/load piloté par script) ; recaler les séquences ; vérifier intégrité référentielle.
4. **Repointer l'ancien stack Express sur Postgres** (`drizzle-orm/mysql2`→`drizzle-orm/node-postgres`) et faire **tourner la suite de tests d'intégration (354) contre Postgres** comme filet de validation.
5. Activer **RLS** sur les tables tenant (policy `artisan_id = current_setting('app.tenant')`), même si l'ancien code ne s'en sert pas encore — préparé pour le nouveau stack.

> **Honnêteté** : c'est l'étape la plus risquée (sémantique de types, exactitude des montants, FK). Alternative envisagée — **garder MySQL pour l'ancien, Postgres pour le nouveau, et synchroniser** — **rejetée** : le dual-DB sur des domaines couplés par FK impose un dual-write/CDC complexe et fragile. **Faire la bascule DB d'abord, proprement, isole les deux problèmes difficiles** (moteur DB *vs* framework/archi) au lieu de les cumuler.

## 2.3 Pattern d'architecture

### Recommandation : **Modular Monolith** à influence hexagonale (confiance élevée)

Pas de microservices (équipe réduite, un seul déployable suffit, le couplage transactionnel devis↔factures↔compta y est hostile). Pas de Clean Architecture « pure » dogmatique partout (sur-ingénierie pour du CRUD). On vise le **bon niveau d'abstraction par module** :

- **Découpage par domaine métier** (bounded contexts), pas par couche technique.
- Dans chaque module : un **port repository** (interface) + impl Drizzle, des **use-cases** (la logique métier testable unitairement), une **couche transport** tRPC/REST mince.
- **Tenant context** dans un **shared kernel** : un objet `TenantContext { artisanId, userId, role, permissions }` construit une fois par requête, **propagé explicitement**, et **le repository exige le tenant** dans sa signature → on **supprime structurellement** le pattern « j'ai oublié le check d'ownership ». Couplé au **RLS Postgres** = ceinture + bretelles contre l'IDOR.
- Effets de bord (email, SMS, Stripe, S3, PDF, Gemini) derrière des **ports** → mockables en test, idempotence centralisée.

### Esquisse de structure cible

```
src/
  shared/                      # shared kernel
    tenant/                    # TenantContext, extraction depuis le JWT
    db/                        # client Drizzle (pg), helper withTenant() (set RLS)
    errors/  result/  config/  logger/
  modules/
    clients/
      domain/                  # entités, règles, value objects (Montant, NumeroFacture…)
      application/             # use-cases : createClient, getEncoursClient…  (← testés en unit)
      infra/
        client.repository.ts   # interface (port)
        client.repository.drizzle.ts
      interface/
        clients.router.ts      # tRPC : valide (zod) → appelle un use-case
      clients.module.ts        # wiring (DI)
    devis/  factures/  comptabilite/  interventions/  chantiers/
    fournisseurs/  contrats/  techniciens/  vehicules/  abonnement/  assistant-ia/ ...
  platform/
    auth/                      # émission/vérif JWT, sessions (révocation), bcrypt
    scheduler/                 # jobs (relances, récurrentes…) — idempotents, isolés
    webhooks/stripe/
  app.ts                       # Fastify : plugins, montage des modules, adapter tRPC
```

Règle de dépendance : `interface → application → domain`, `infra` implémente des ports du `domain/application`. **Aucun module n'importe le `infra` d'un autre** ; les échanges inter-modules passent par des use-cases exposés ou des events.

## 2.4 Tests

### Framework : **garder Vitest** (confiance élevée)

Déjà en place, rapide (esbuild/Vite), ESM natif, API compatible Jest. Aucune raison de passer à Jest (plus lent en ESM/TS). 

### Stratégie — pyramide, pour couvrir sans freiner les livraisons

1. **Unit par use-case** (la majorité, rapides, repos & ports **mockés**) : c'est ce qui devient *possible* une fois la logique sortie de `db.ts`. Cible : chaque règle métier sensible (TVA, numérotation, transitions de statut, anti-double-billing) a son test unitaire.
2. **Intégration par module** sur **Postgres jetable via Testcontainers** (ou un schéma éphémère) : valide repos + RLS + migrations. Pas d'IDs codés en dur ; fixtures par test.
3. **Suite d'isolation cross-tenant = gate de premier rang** : on **récupère et généralise** les tests existants (`isolation-multi-tenant`, `security`) en un harnais qui, pour **chaque** route « par id », tente un accès cross-tenant et **exige un refus**. C'est le test qui aurait empêché les 24 IDOR.
4. **Contrat/e2e minces** sur les parcours critiques (auth, devis→signature→facture, webhook Stripe, exports compta), pas une couverture e2e exhaustive (lente, fragile).
5. **Couverture mesurée** (`vitest --coverage`) avec un seuil **sur le code migré** uniquement, pour ne pas bloquer sur le legacy.
6. **Tout en CI** (GitHub Actions à créer) : lint + typecheck + unit + intégration + isolation, **bloquants** avant merge/déploiement. Séparer **`migrate` du `deploy`** (ne plus migrer au boot).

---

# Étape 3 — Stratégie de migration dual-stack

## 3.1 Principe : Strangler Fig sur une DB unique

On **n'arrête jamais** l'ancien stack d'un coup. Après la **bascule DB (phase 0)**, ancien (Express) et nouveau (Fastify) **partagent la même base Postgres**. On migre **domaine par domaine** ; à chaque domaine prêt, on **route son trafic** vers le nouveau stack. **Pas de dual-write** dans le cas général (une seule source de vérité = la DB partagée) → c'est ce qui rend la cohabitation simple et le rollback instantané.

## 3.2 Design du dual-stack

```
                 Cloudflare Pages Function  (proxy /api/*  — déjà en place)
                                │
                 ┌──────────────┴───────────────┐
        route par préfixe tRPC / chemin REST + feature flag
                                │
        ┌───────────────────────┴────────────────────────┐
   ANCIEN (Express+tRPC)                          NOUVEAU (Fastify+tRPC)
   appRouter legacy (domaines non migrés)         modules migrés (clients, devis…)
        └───────────────────────┬────────────────────────┘
                                │
                       PostgreSQL unique (Drizzle pg, RLS)
```

- **Aiguillage** : le proxy Cloudflare (`functions/api/[[path]].js`) existe déjà ; on l'enrichit (ou on insère un petit routeur/Fastify-gateway) pour router **par chemin tRPC** (`/api/trpc/clients.*` → nouveau, le reste → ancien) ou par **route REST**. tRPC expose le nom de procédure dans l'URL → routage trivial par préfixe de routeur.
- **Feature flags** : un flag par domaine (`migrate.clients = on/off`), idéalement **par tenant** d'abord (canary : on bascule quelques artisans avant tous). Source du flag : variable d'env ou table de config lue par le gateway.
- **Auth partagée sans dual-write** : l'ancien stack **reste l'émetteur** du JWT ; le nouveau stack **vérifie le même cookie** avec le **même `JWT_SECRET`**. Aucune migration d'auth tant que tout n'est pas basculé → l'auth est traitée **en dernier**.
- **Schéma partagé** : un seul `schema.ts` Drizzle, une seule chaîne de migrations, possédée par le nouveau stack. L'ancien le lit aussi.
- **Dual-write : exception only.** Nécessaire seulement si un domaine migré change la *forme* d'une table encore écrite par l'ancien. On l'évite en gardant le schéma stable pendant le strangling (refactor de schéma = après).

## 3.3 Séquençage des domaines (par risque × valeur × couplage)

Principe : **valider le pattern sur des domaines à faible couplage et risque maîtrisé**, finir par le cœur transactionnel très couplé, puis l'auth.

| Vague | Domaines | Pourquoi à ce moment |
| --- | --- | --- |
| **0 — Socle** | Bascule **DB → Postgres** ; **shared kernel** (TenantContext, repo pattern, RLS, ports email/SMS/S3) ; **CI** ; gateway de routage | Rien ne peut être migré proprement avant. Livre le filet (RLS + isolation suite + CI). |
| **1 — Pilotes (faible couplage, fort signal IDOR)** | `vehicules`, `badges`/`techniciens`, `support`, `avis`, `geolocalisation` | Domaines « feuilles », déjà épinglés IDOR → on **prouve** que le nouveau pattern tue la classe de bug, sur des entités peu risquées. |
| **2 — Référentiels** | `clients`, `articles`/`bibliotheque`, `fournisseurs`, `stocks`, `parametres` | Lus par tout le monde mais logique simple ; sécurise les FK (`clientId`) à la racine. |
| **3 — Cœur transactionnel** | `devis` (+options/signature/relances), `factures` (+récurrentes), `contrats`, `comptabilite`, `commandes_fournisseurs` | Le plus de valeur **et** de couplage/risque (TVA, numérotation, double-billing, immutabilité post-signature). Migré une fois le pattern éprouvé. |
| **4 — Terrain & temps réel** | `interventions`/`mobile`, `chantiers`, `rdv`, `calendrier`, `notifications(push)`, `assistant-ia` (SSE) | Dépend des référentiels ; SSE/temps réel à valider sur Fastify. |
| **5 — Plateforme & bascule finale** | `abonnement`/Stripe + webhook, `utilisateurs`/permissions, **auth** (+ révocation de session), `scheduler` | L'auth et le scheduler touchent tout → en dernier ; quand ils basculent, l'ancien stack est éteint. |

> Le **scheduler** peut être extrait tôt comme **service/job isolé idempotent** lisant la DB partagée, indépendamment de l'ordre des domaines.

## 3.4 Critères de bascule (par domaine)

Un domaine bascule (flag `on`) seulement si **tous** ces critères sont verts :

1. **Parité fonctionnelle** : chaque procédure de l'ancien routeur a son équivalent (mêmes entrées/sorties, vérifié par tests de contrat).
2. **Isolation cross-tenant** : la suite d'isolation passe à 100 % sur le domaine, **et** RLS actif sur ses tables.
3. **Tests** : unit use-cases + intégration module verts en CI ; couverture ≥ seuil défini.
4. **Canary** : basculé d'abord pour un sous-ensemble de tenants ; **comparaison shadow** (mêmes requêtes envoyées aux deux stacks, diff des réponses) sans écart.
5. **Perf & erreurs** : latence p95 ≤ ancien, taux d'erreur sous le budget, sur la fenêtre canary.
6. **Observabilité** : logs/traces du nouveau module en place.

## 3.5 Stratégie de rollback

- **Bascule de domaine** : **flip du flag `on→off`** dans le gateway → trafic re-routé vers l'ancien stack. **Instantané et sûr car DB partagée** (aucune divergence de données). On **garde le code legacy du domaine** au moins **N semaines** (ex. 2–4) après stabilisation avant suppression.
- **Canary par tenant** : rollback ciblé (re-flag des tenants concernés) sans impacter les autres.
- **Phase 0 (DB)** : le seul point sans rollback trivial. Mitigation → bascule lors d'une **fenêtre planifiée**, **dump MySQL conservé**, validation par la suite d'intégration sur Postgres *avant* d'ouvrir le trafic, possibilité de **repointer l'ancien stack sur MySQL** tant que le nouveau schéma n'a pas reçu d'écritures divergentes.
- **Migrations** : sorties du boot, jouées en étape dédiée, idéalement **expand/contract** (ajouter avant, retirer après) pour rester rétro-compatible avec l'ancien stack pendant la cohabitation.

## 3.6 Estimation grossière par phase

Hypothèse : **1–2 développeurs**. Fourchettes = ordres de grandeur, **pas un engagement** ; dépend fortement de la propreté de la conversion DB et du temps consacré aux tests.

| Phase | Contenu | Estimation |
| --- | --- | --- |
| **0** | Conversion schéma + migration données MySQL→PG, repoint ancien stack, RLS, **shared kernel**, **CI**, gateway de routage, harnais d'isolation généralisé | **4–6 sem.** |
| **1** | Domaines pilotes (vehicules, badges/techniciens, support, avis, géoloc) — rodage du pattern | **3–4 sem.** |
| **2** | Référentiels (clients, articles, fournisseurs, stocks, parametres) | **3–4 sem.** |
| **3** | Cœur transactionnel (devis, factures, contrats, compta, commandes) — le plus dense | **6–9 sem.** |
| **4** | Terrain & temps réel (interventions, chantiers, rdv/calendrier, notifications, assistant SSE) | **4–6 sem.** |
| **5** | Plateforme : Stripe/webhook, utilisateurs/permissions, **auth + révocation**, scheduler ; **extinction de l'ancien stack** | **3–5 sem.** |
| | **Total** | **~23–34 sem.** |

Le **scheduler isolé** (job idempotent) peut être mené en parallèle dès la phase 1 (~1 sem. fractionnée).

## 3.7 Quick wins à faire dès maintenant (indépendants de la refonte)

Pendant que la refonte se prépare, et sans rien casser :
- **Supprimer les dépendances mortes** (`lucia`, `@lucia-auth/adapter-mysql`, `bcrypt` doublon ; trancher Clerk).
- **Mettre en place la CI** (lint + typecheck + tests existants) — réutilisable directement par le nouveau stack.
- **Sortir les migrations du boot** du conteneur.
- **Compléter `db-secure`** sur les routes IDOR les plus graves déjà identifiées (atténuation avant le fix structurel par RLS).

---

## 4. Risques & questions ouvertes (honnêteté)

| Question | Enjeu | À trancher par |
| --- | --- | --- |
| **Edge-first un jour ?** | Détermine Fastify (reco) vs Hono. Tant que non décidé → Fastify. | Produit/infra |
| **Conversion DB** | Étape la plus risquée (types, montants exacts, FK). | Spike technique en début de phase 0 |
| **Canary par tenant** | Suppose un flag par tenant dans le gateway ; faisable mais à concevoir. | Phase 0 |
| **Front en parallèle** | Les contrats tRPC doivent rester stables pendant le strangling ; sinon coût front. | À cadrer par domaine |
| **Capacité** | À 1 dev, la fourchette haute (~34 sem.) est plus réaliste. | Staffing |
| **Refactor de schéma** | Reporté *après* la migration (sinon dual-write) — à acter. | Archi |

---

### Annexe — méthode d'audit

Chiffres établis par inspection directe du dépôt le 2026-06-12 : comptage des `mysqlTable` (`drizzle/schema.ts`), des `router({`/`.query`/`.mutation` et des appels `db.`/`dbSecure.` (`server/routers.ts`), des `export function` (`server/db.ts`), des fichiers et cas de test (`server/**/*.test.ts`), lecture des configs (`docker-compose*.yml`, `terraform/*.tf`, `nixpacks.toml`, `package.json`, `functions/api/[[path]].js`) et d'un échantillon des **317 audits** de `docs/audits/` (dont 24 `*-idor*`).

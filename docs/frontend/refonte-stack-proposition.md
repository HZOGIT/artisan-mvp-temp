# Refonte progressive du frontend — proposition de stack & stratégie de migration

> **Spike OPE-366** · Projet *Refonte progressive du frontend (clean archi + REST)*
> Auteur : agent frontend · Date : 2026-06-16
> Statut : proposition (à valider) · PoC livré : liste clients sur `/v2/clients` via REST généré.

Ce document est le livrable de spike. Il (1) cartographie l'existant réel, (2) audite chaque
dépendance, (3) propose une stack cible justifiée, (4) décrit la bascule REST + client
openapi-typescript, (5) détaille la stratégie strangler page par page et la structure clean-archi
cible, et (6) documente le PoC bout-en-bout déjà committé.

---

## 0. TL;DR — stack retenue

| Brique | Aujourd'hui | Cible | Verdict |
|---|---|---|---|
| Build | Vite 7 | **Vite 7** (imposé) | garder |
| Langage | TS 5.9 `strict` | TS `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | durcir |
| Routing | wouter (non typé) | **TanStack Router** (type-safe, params/search typés) | remplacer |
| Data fetching | TanStack Query + tRPC + axios | **TanStack Query** + **openapi-fetch/openapi-react-query** (REST généré) | converger |
| Contrat API | tRPC `AppRouter` (couplage) | **OpenAPI** généré depuis les schémas zod → **openapi-typescript** | basculer |
| State serveur | TanStack Query | **TanStack Query** | garder |
| State UI | Context maison | **Zustand** (global) + **nuqs** (état d'URL) + context (thème) | introduire ciblé |
| Formulaires | react-hook-form + zod | **react-hook-form + zod** (+ `@hookform/resolvers`) | garder |
| UI primitives | Radix + Tailwind (ad hoc) | **Radix + Tailwind formalisés en primitives shadcn/ui** + tokens | formaliser |
| Tables | tableaux maison | **TanStack Table** (headless) | introduire |
| Charts | recharts **+** chart.js | **recharts** seul | dédupliquer |
| Dates | date-fns 4 | **date-fns 4** | garder |
| Thème | ThemeContext maison **+** next-themes | **ThemeContext maison** seul | dédupliquer |
| Animations | framer-motion 12 | **framer-motion (motion)** | garder |
| Lint/format | *(aucun ESLint)* + Prettier | **Biome** (lint + format, une dépendance) | introduire |
| Tests | Vitest | **Vitest + Testing Library** + Playwright (déjà là) | compléter |
| Auth front | `@clerk/clerk-react` (mort) | cookie `token` (jose côté serveur) | **supprimer Clerk** |

**Dépendances à supprimer immédiatement (mortes/doublons) :** `@clerk/clerk-react`, `axios`,
`chart.js`, `add`, et un des deux paquets d'animations Tailwind (`tailwindcss-animate` vs
`tw-animate-css`). Détails §2.

---

## 1. État des lieux (cartographie réelle)

### 1.1 Organisation

- **Monorepo applicatif** : un seul `package.json` à la racine ; le front vit dans `client/`,
  monté par Vite (`vite.config.ts` : `root = client/`, alias `@ → client/src`, `@shared → shared`).
- **React 19.2** + **Vite 7** + **Tailwind 4** (`@tailwindcss/vite`, pas de `tailwind.config` PostCSS
  classique) + **Radix UI**.
- **~91 pages** (`client/src/pages/*`), montées dans un unique `client/src/App.tsx`.
- Dossiers clean-archi **amorcés mais quasi vides** : `client/src/{_core,app,domain,infra-web}` ne
  contiennent aujourd'hui **que la feature voix** (`domain/voice`, `infra-web/*VoiceSession*`,
  `app/useVoiceSession.ts`, `_core/hooks/useAuth.ts`). Le reste de l'app est « pages + hooks + lib »
  classique. La clean-archi front est donc à **généraliser**, pas à inventer.

### 1.2 Routing (wouter)

- `client/src/App.tsx` : deux `Switch` wouter. Un routeur public (login, signature, portail,
  paiement, vitrine…) + un **catch-all unique `AuthenticatedRoutes`** qui enveloppe toutes les routes
  privées dans `DashboardLayout` (pour persister le layout/drawer entre navigations).
- Pages critiques en **import eager** (Home, SignIn, Dashboard, Onboarding…), le reste en
  `React.lazy` + `Suspense` (code-splitting par route déjà en place — à conserver).
- **Pas de typage des routes** : `wouter` ne type ni les params (`/clients/:id`) ni les query strings.
  wouter est même **patché** (`patches/wouter@3.7.1.patch`) — signal de friction.
- Garde d'auth implicite : `AuthenticatedRoutes` lit `trpc.modules.getOnboardingStatus` et redirige ;
  `useAuth` (`_core/hooks/useAuth.ts`) lit `trpc.auth.me` et `trpc.auth.logout`.

### 1.3 Dialogue front ↔ backend (trois couches)

- **tRPC** : `client/src/lib/trpc.ts` crée `createTRPCReact<AppRouter>()` où `AppRouter` est importé
  **directement du backend** (`../../../src/interface/trpc/router`). Couplage type fort, mais lie le
  build front au code serveur. Provider câblé dans `client/src/main.tsx` (`httpBatchLink` →
  `/api/trpc`, **superjson**, `credentials: "include"`). **103 fichiers** importent `trpc`.
- **TanStack Query v5** : QueryClient configuré dans `main.tsx` (`staleTime` 5 min,
  `refetchOnWindowFocus: false`). C'est le socle data — **à garder**.
- **axios** : présent dans `package.json` mais **aucun import** dans tout le repo (`grep` = 0).
  **Dépendance morte.**

### 1.4 Auth

- JWT en cookie **`token`** (host-only), vérifié côté serveur (`jose`) ; le front ne lit jamais le
  token, il s'appuie sur `credentials: "include"`. `@clerk/clerk-react` est **présent mais jamais
  importé** (`grep` = 0 ; cf. `docs/audits/2026-06-10-dependances-mortes-clerk-csp-debloquee.md`). Au
  `pnpm add`, Clerk lève même un **conflit de peer-deps** sur React 19.2. **À supprimer.**

### 1.5 Points de douleur / sources de bugs

1. **Pas de typage de route** (wouter) → params/search non vérifiés, bugs silencieux à la navigation.
2. **Trois façons d'appeler le serveur** (tRPC, axios mort, fetch ad hoc) → incohérence.
3. **Couplage de build front↔serveur** via l'import du type `AppRouter` : le front ne compile pas
   sans le code backend ; impossible de livrer/versionner le front indépendamment.
4. **superjson obligatoire** des deux côtés (cf. mémoire projet) : un oubli casse silencieusement les
   mutations. Le REST + JSON standard supprime cette classe de bugs.
5. **Contrat implicite** : un changement de mutation backend (ex. P1 du 2026-06-16, `update({statut})`
   ignoré) ne se voit pas au type. Un contrat **OpenAPI** explicite + tests de contrat le rendraient
   visible.
6. **Aucun linter** (pas d'ESLint config) → dérives non détectées.
7. **Doublons** (recharts+chart.js, deux paquets d'animations Tailwind, ThemeContext+next-themes) →
   poids et incohérence.

---

## 2. Audit des dépendances (garder / remplacer / supprimer)

Légende : ✅ garder · ♻️ remplacer/migrer · ❌ supprimer. Versions = `package.json` au 2026-06-16.

### 2.1 Cœur (à garder)

| Lib | Version | Verdict | Justification |
|---|---|---|---|
| react / react-dom | 19.2.1 | ✅ | socle, à jour. |
| vite | 7.1.7 | ✅ | imposé, dernière majeure. |
| @vitejs/plugin-react | 5.0.4 | ✅ | requis. |
| tailwindcss + @tailwindcss/vite | 4.1.x | ✅ | Tailwind v4, pipeline Vite natif. |
| @tailwindcss/typography | 0.5.15 | ✅ | prose (docs, emails). |
| @tanstack/react-query | 5.90.2 | ✅ | **socle data cible**. |
| @radix-ui/* (28 paquets) | 1.x–2.x | ✅ | primitives accessibles ; à **formaliser en shadcn/ui**. |
| react-hook-form | 7.64.0 | ✅ | perf + ergonomie ; cible conservée. |
| @hookform/resolvers | 5.2.2 | ✅ | pont rhf↔zod. |
| zod | 4.1.12 | ✅ | validation ; **source de l'OpenAPI** (§3). |
| date-fns | 4.1.0 | ✅ | dates tree-shakable. |
| lucide-react | 0.453.0 | ✅ | icônes. |
| class-variance-authority / clsx / tailwind-merge | — | ✅ | `cn()` + variants (pattern shadcn). |
| sonner | 2.0.7 | ✅ | toasts (déjà `@/components/ui/sonner`). |
| cmdk | 1.1.1 | ✅ | command palette. |
| vaul | 1.1.2 | ✅ | drawer mobile. |
| embla-carousel-react | 8.6.0 | ✅ | carrousel (1 usage). |
| react-day-picker | 9.11.1 | ✅ | calendrier (composant date). |
| react-resizable-panels | 3.0.6 | ✅ | layouts (1 usage). |
| input-otp | 1.4.2 | ✅ | OTP (2 usages). |
| framer-motion | 12.23.22 | ✅ | animations (16 usages) ; importer via `motion`. |
| streamdown | 1.4.0 | ✅ | markdown en streaming (assistant IA, 2 usages). |

### 2.2 À remplacer / migrer

| Lib | Version | Verdict | Justification & cible |
|---|---|---|---|
| wouter | 3.3.5 (patché 3.7.1) | ♻️ | non typé + **patché** (friction). → **TanStack Router** (params/search typés). |
| @trpc/client, @trpc/react-query | 11.6.0 | ♻️ | couche transport à **retirer page par page** au profit de REST généré. Reste tant que des pages legacy l'utilisent (103 fichiers). |
| superjson | 1.13.3 | ♻️ | requis **uniquement** par le transport tRPC. Disparaît avec la dernière page tRPC. REST = JSON standard. |
| xlsx (SheetJS) | 0.18.5 | ♻️ | **sécurité** : la 0.18.5 du registre npm est ancienne (prototype pollution, ReDoS connus). La version maintenue est distribuée **hors npm** (`cdn.sheetjs.com`). → migrer vers la distribution officielle à jour, ou isoler l'import/parse côté serveur. |
| next-themes | 0.4.6 | ♻️ | **redondant** avec `contexts/ThemeContext.tsx` (thème maison). Seul `ui/sonner.tsx` l'importe. → router sonner sur le ThemeContext maison puis **supprimer**. |
| jspdf / jspdf-autotable | 4.0 / 5.0.7 | ♻️ (dette) | génération PDF **client** lourde (7 usages). Dette assumée (cf. mémoire projet : rendu PDF = seule dette tolérée). À terme : PDF côté serveur (routes `/api/.../pdf` existent déjà). |
| autoprefixer + postcss | 10.4 / 8.4 | ♻️ | sous **Tailwind v4 + @tailwindcss/vite**, le pipeline PostCSS classique est largement inutile. Vérifier puis retirer si aucun autre plugin PostCSS. |

### 2.3 À supprimer (mort / doublon / erreur)

| Lib | Version | Verdict | Justification |
|---|---|---|---|
| @clerk/clerk-react | 5.59.6 | ❌ | **morte** (0 import) + conflit peer-deps React 19.2. Auth = cookie JWT. |
| axios | 1.12.0 | ❌ | **morte** (0 import dans tout le repo). |
| chart.js | 4.5.1 | ❌ | **doublon** charts : 1 seul usage (`pages/Previsions.tsx`) vs recharts (6 usages). Migrer Previsions vers recharts, supprimer chart.js. |
| add | 2.0.6 | ❌ | **paquet parasite** (issu d'un `npm install add` accidentel), aucune valeur. |
| tailwindcss-animate | 1.0.7 | ❌ | **doublon** avec `tw-animate-css` (devDep, successeur Tailwind v4). 0 import direct. Garder un seul. |

### 2.4 Outillage / qualité

| Lib | Version | Verdict | Justification |
|---|---|---|---|
| typescript | 5.9.3 | ✅ | à jour ; durcir les flags (§5). |
| vitest | 2.1.4 | ✅ | OK (bump v3 possible plus tard). |
| prettier | 3.6.2 | ♻️ | → **Biome** (lint+format en un binaire Rust, ultra-rapide). Aucun ESLint aujourd'hui : Biome comble le **trou de lint** ET remplace Prettier. |
| @builder.io/vite-plugin-jsx-loc | 0.1.1 | ✅ (dev) | click-to-source en dev ; sans impact prod. |
| pnpm (dans devDependencies) | 10.15.1 | ❌ | redondant avec `packageManager` (pnpm déjà épinglé). Retirer de devDeps. |

> **Hors périmètre front mais repérés** (à logger en findings) : `express` **et** `fastify`
> coexistent (express = legacy en extinction) ; `bcrypt` **et** `bcryptjs` coexistent (doublon de
> hash). À traiter dans la dette backend, pas dans cette refonte front.

---

## 3. Bascule REST + client auto-généré

### 3.1 Principe : REST en parallèle de tRPC, **zéro logique dupliquée**

Le new-stack est déjà en **clean archi** : les routeurs tRPC sont des transports minces qui délèguent
à des **use-cases purs** (`src/modules/*/application/*`). On expose donc le REST en réutilisant **les
mêmes use-cases** — exactement comme le font déjà les routes HORS-tRPC existantes
(`src/interface/http/*-route.ts`, ex. `articles-search-route.ts`, `comptabilite-export-route.ts`).

Exemple réel livré par ce spike (`src/interface/http/rest/clients-rest-route.ts`) :

```ts
export function registerClientsRestRoute(app: FastifyInstance, deps: ClientsRestDeps): void {
  app.get("/api/rest/clients", async (req, reply) => {
    const auth = await authArtisanFromCookie(req, deps);      // même cookie `token` que tRPC
    if (auth.status === "unauthenticated") return reply.code(401).send({ error: "Non authentifié" });
    if (auth.status === "no-artisan") return reply.code(404).send({ error: "Artisan non trouvé" });
    const clients = await listClients(deps.repo, { artisanId: auth.artisanId, userId: auth.userId });
    return reply.send(clients);                                // JSON standard (dates ISO), pas de superjson
  });
}
```

Le routeur tRPC `clients` et cette route REST appellent **le même `listClients`**. Aucune
régression possible entre les deux surfaces.

### 3.2 Générer l'OpenAPI **depuis les schémas zod** (cible)

Les routeurs tRPC portent déjà des schémas zod d'input (`createSchema`, `updateSchema`… dans
`clients.router.ts`). La cible est de **dériver l'OpenAPI de ces schémas** plutôt que de l'écrire à la
main, via :

- **`@fastify/swagger`** (+ `@fastify/swagger-ui` en dev) pour exposer le document, et
- **`fastify-zod-openapi`** / **`zod-to-openapi`** pour convertir les schémas zod en composants
  OpenAPI. On enregistre chaque route REST avec son `schema: { querystring, params, body, response }`
  zod ; Fastify valide à l'exécution **et** publie le contrat. Source unique : zod.

```
zod (use-cases / routes REST)
   └─ fastify-zod-openapi ─► document OpenAPI servi sur /api/openapi.json
                                   └─ openapi-typescript ─► client/src/modern/shared/api/schema.d.ts
                                          └─ openapi-fetch + openapi-react-query ─► hooks typés
```

> **PoC (livré)** : pour démontrer la chaîne **sans** attendre le câblage `@fastify/swagger`, le spec
> OpenAPI du domaine clients est committé en clair (`openapi/operioz.openapi.json`) et sert de source à
> `openapi-typescript`. Le passage « zod → OpenAPI auto » est un chantier dédié (§6).

### 3.3 Pipeline openapi-typescript (livré, exécutable)

`package.json` :

```json
"scripts": {
  "gen:api": "openapi-typescript openapi/operioz.openapi.json -o client/src/modern/shared/api/schema.d.ts"
}
```

`pnpm gen:api` régénère les types. **CI** : ajouter un job qui lance `gen:api` puis `git diff --exit-code`
sur `schema.d.ts` → échoue si le client n'a pas été régénéré après un changement de contrat (anti-drift,
même esprit que `edge-dispatch.test.ts`).

### 3.4 Couche de requêtes typée (livré)

```ts
// client/src/modern/shared/api/http-client.ts
export const api = createClient<paths>({ baseUrl: "/", credentials: "include" }); // cookie `token`

// client/src/modern/shared/api/query.ts
export const $api = createQueryClient(api); // hooks TanStack Query par endpoint
```

Convention d'appel — **un hook applicatif par use-case**, l'UI ne voit jamais l'URL :

```ts
// client/src/modern/features/clients/application/use-clients.ts
export function useClients() {
  const q = $api.useQuery("get", "/api/rest/clients"); // chemin + données typés par le schéma
  return { clients: (q.data ?? []) as Client[], isLoading: q.isLoading, /* … */ };
}
```

- **Auth** : `credentials: "include"` ⇒ cookie `token` envoyé automatiquement.
- **Erreurs** : `openapi-fetch` renvoie `{ data, error }` typés (les réponses 4xx du schéma sont des
  types d'erreur explicites). On centralisera une `throwOnError`/middleware pour mapper 401 → redirect
  login, 5xx → toast.
- **Pagination** : conventionnée dans l'OpenAPI (`?page&limit` + enveloppe `{ items, total }`) et donc
  typée côté client.

---

## 4. Stratégie de migration progressive (strangler)

### 4.1 Cohabitation dans la **même app Vite**

Legacy (wouter + tRPC) et moderne (TanStack Router + REST) vivent côte à côte. Trois niveaux de
granularité, du plus simple au plus propre :

1. **Par route, dans le routeur actuel (immédiat — utilisé par le PoC).** On monte la page moderne sur
   un chemin neuf à côté du legacy :

   ```tsx
   // client/src/App.tsx (wouter)
   <Route path="/clients" component={Clients} />            {/* legacy tRPC */}
   <Route path="/v2/clients" component={ClientsModernPage} /> {/* moderne REST + clean archi */}
   ```

   Zéro risque : le legacy reste la route servie ; la version moderne est accessible et testable en
   parallèle. Quand elle est validée, on **bascule** `/clients` vers la page moderne et on supprime
   l'ancienne.

2. **Sous-arbre TanStack Router monté dans wouter (phase 2).** On introduit un `RouterProvider`
   TanStack sur un préfixe (`/v2/*`) ; toutes les pages migrées y vivent avec routing typé, le legacy
   wouter gardant le reste. Les deux QueryClient sont partagés (un seul provider dans `main.tsx`).

3. **Bascule du routeur racine (phase finale).** Quand la majorité des pages sont migrées, TanStack
   Router devient le routeur racine et wouter est retiré avec la dernière page legacy.

**Feature flag optionnel** : un flag par page (`?v2=1` ou flag serveur via
`trpc.modules.getOnboardingStatus`-like) permet d'ouvrir la version moderne à un sous-ensemble
d'utilisateurs et de **rollback instantané** (le legacy n'est jamais supprimé avant validation).

### 4.2 Critères de bascule + rollback (par page)

**Bascule** d'une page `/x` → moderne quand :
- parité fonctionnelle vérifiée (mêmes actions, mêmes effets persistés) ;
- endpoint(s) REST exposé(s) + types régénérés (`gen:api` vert en CI) ;
- test e2e mutation ajouté dans `scripts/staging-e2e-mutations.mjs` (cf. CLAUDE.md — règle
  « un test persistant par fix/feature ») **rouge avant / vert après** ;
- sweep navigateur `issues: 0` sur la route.

**Rollback** : repointer le `<Route path="/x">` (ou le flag) sur le composant legacy — conservé tant
que la page moderne n'a pas tenu une période d'observation. Aucune suppression de code legacy avant
fenêtre de stabilité.

### 4.3 Ordre de réécriture des ~91 pages

Principe : **commencer par le simple et le très consulté** (rodage de la stack à faible risque), finir
par le critique transactionnel (quand l'outillage et les conventions sont éprouvés). On suit la même
priorisation que la boucle de tests (portail/paiement/signature = critiques, traités avec le plus de
garde-fous).

**Vague 1 — rodage (lecture, faible risque, fort trafic)** : `Clients` (PoC ✅), `ClientDetail`,
`Articles`, `Fournisseurs`, `Techniciens`, `Notifications`. → valide routing typé + REST + clean archi
sur des CRUD simples.

**Vague 2 — listes + mutations courantes** : `Devis`, `Factures`, `Interventions`, `Commandes*`,
`Stocks`, `Depenses`. → valide les mutations REST + invalidation Query + tests de contrat.

**Vague 3 — critique transactionnel & public** : `Dashboard`, `SignatureDevis`, `PortailClient`,
`PaiementSucces/Annule`, `Comptabilite`, `IntegrationsComptables`, abonnement. → fort niveau de
garde-fous (e2e navigateur obligatoire), bascule sous flag.

**Vague 4 — longue traîne & nettoyage** : pages de paramétrage, légales, vitrine, assistant/IA ;
suppression de wouter/tRPC/superjson une fois la dernière page migrée ; retrait des deps mortes.

### 4.4 Structure clean-archi cible (parité backend `src/modules/*`)

```
client/src/modern/
├─ shared/
│  ├─ api/
│  │  ├─ schema.d.ts        # généré (openapi-typescript) — NE PAS éditer
│  │  ├─ http-client.ts     # openapi-fetch (baseUrl, credentials: include)
│  │  └─ query.ts           # openapi-react-query ($api)
│  ├─ ui/                   # primitives shadcn/ui (Button, Card, Table…) + tokens design
│  ├─ router/               # TanStack Router (routeTree, guards typés)
│  └─ lib/                  # utils transverses (cn, formatters, dates)
├─ features/
│  └─ <feature>/            # 1 dossier par domaine, miroir de src/modules/<domaine>
│     ├─ domain/            # types & règles métier PURES (dérivés du contrat, testables sans réseau)
│     ├─ application/       # use-cases front = hooks (use-clients.ts) : orchestrent Query + domaine
│     ├─ infra-web/         # accès techniques spécifiques (storage, ws, openapi calls non triviaux)
│     └─ ui/                # composants & pages (présentation pure, consomment application/)
└─ app/                     # composition racine moderne (providers, RouterProvider)
```

Rôles (parité backend) : **domain** = cœur métier pur sans dépendance technique · **application** =
use-cases (hooks) qui orchestrent données + domaine · **infra-web** = adaptateurs techniques (REST,
storage, audio…) · **ui** = présentation. La dépendance va **ui → application → domain** ; jamais
l'inverse. `infra-web` est injecté dans `application`.

---

## 5. Qualité & anti-bug (transverse)

- **TypeScript** : activer `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noFallthroughCasesInSwitch` sur le code `modern/` (nouveau `tsconfig.modern.json` gate, à l'image de
  `tsconfig.src.json` côté backend qui isole le code neuf de la dette legacy).
- **Biome** : lint + format (remplace Prettier, comble l'absence d'ESLint). Règles `recommended` +
  `noExplicitAny`. Gate CI sur `modern/` d'abord, élargi ensuite.
- **Type-safety end-to-end** : zod (serveur) → OpenAPI → openapi-typescript (client). Un changement de
  contrat casse la **compilation** du front, pas le runtime des utilisateurs.
- **Tests** :
  - *unit/domaine* : Vitest sur `domain/` (fonctions pures, ex. `nomComplet`).
  - *composants* : **@testing-library/react** + Vitest (jsdom) sur les pages migrées.
  - *contrat REST* : test colocalisé par route (`*-rest-route.test.ts`) avec fakes, **sans DB**
    (livré pour clients).
  - *e2e* : **Playwright déjà en place** (`scripts/pw-run.sh`, `staging-e2e-mutations.mjs`) — chaque
    page migrée ajoute son cas de mutation persistante.
- **Error boundaries / Suspense** : `ErrorBoundary` racine existe déjà ; en ajouter un **par route**
  moderne (TanStack Router supporte `errorComponent`/`pendingComponent` par route).
- **Perf** : code-splitting par route (déjà en place) conservé par TanStack Router (lazy routes) ;
  `staleTime` raisonné par domaine ; pas de surcharge bundle (openapi-fetch ≈ 6 kB, openapi-react-query
  ≈ 1 kB, vs retrait de Clerk/axios/chart.js = **gain net**).

---

## 6. PoC livré (bout-en-bout)

**Ce qui est committé et vérifié :**

- **Backend REST** : `src/interface/http/rest/clients-rest-route.ts` — `GET /api/rest/clients` &
  `GET /api/rest/clients/:id`, auth cookie `token`, isolation tenant, **mêmes use-cases que tRPC**.
  Enregistré dans `src/app.ts` ; ajouté au registre de routes migrées (`src` + miroir edge
  `functions/_lib/dispatch.mjs`, parité verrouillée par `edge-dispatch.test.ts`).
- **Test de contrat (DB-free, vert)** : `src/interface/http/rest/clients-rest-route.test.ts` — 401
  sans cookie, 404 sans artisan, liste scopée tenant (isolation cross-tenant), `getById` cross-tenant
  → 404 (anti-oracle PII). 4/4 verts.
- **Contrat OpenAPI** : `openapi/operioz.openapi.json` (clients).
- **Client généré** : `pnpm gen:api` → `client/src/modern/shared/api/schema.d.ts`.
- **Slice clean-archi front** : `client/src/modern/features/clients/{domain,application,ui}` +
  `shared/api/{http-client,query}.ts`.
- **Cohabitation** : page moderne montée sur **`/v2/clients`** dans `client/src/App.tsx` (legacy
  `/clients` intact).

**Vérifications passées :** `tsconfig.src.json` (backend) **exit 0** ; fichiers `modern/` et `rest/`
**zéro erreur** TS ; test REST **4/4 vert** ; `edge-dispatch.test.ts` **vert** (parité registres).

### Commandes pour rejouer

```bash
# 1. (déjà fait) installer le toolchain
pnpm add -D openapi-typescript
pnpm add openapi-fetch openapi-react-query

# 2. régénérer le client typé depuis l'OpenAPI
pnpm gen:api

# 3. test de contrat de la route REST (sans DB, fakes)
npx vitest run src/interface/http/rest/clients-rest-route.test.ts

# 4. parité des registres edge↔src
npx vitest run src/interface/gateway/edge-dispatch.test.ts

# 5. typecheck du code neuf backend
npx tsc -p tsconfig.src.json --noEmit

# 6. dev : ouvrir la page moderne (cohabite avec le legacy)
#    se connecter, puis naviguer vers /v2/clients
pnpm dev
```

---

## 7. Chantiers d'implémentation à créer (futures issues)

1. **Supprimer les dépendances mortes/doublons** : Clerk, axios, chart.js (migrer Previsions→recharts),
   `add`, un des deux paquets d'animations Tailwind, pnpm en devDeps. Vérifier autoprefixer/postcss.
2. **Câbler `@fastify/swagger` + `fastify-zod-openapi`** : générer l'OpenAPI **depuis les schémas zod**
   des routeurs ; servir `/api/openapi.json` ; brancher `gen:api` dessus.
3. **Gate CI anti-drift du client généré** : `gen:api` + `git diff --exit-code` sur `schema.d.ts`.
4. **Introduire TanStack Router** sur un sous-arbre `/v2/*` (routeTree typé, guards auth, error/pending
   par route).
5. **Formaliser les primitives shadcn/ui** dans `modern/shared/ui` + tokens de design (couleurs,
   espacements) ; router sonner sur le ThemeContext maison puis retirer next-themes.
6. **Adopter Biome** (lint+format) + `tsconfig.modern.json` durci (`noUncheckedIndexedAccess`…).
7. **REST clients complet** : exposer `create/update/delete/search` + pagination, migrer `Clients` et
   `ClientDetail` (vague 1) entièrement vers REST, ajouter les cas e2e mutations.
8. **Runbook de migration page-par-page** : checklist bascule/rollback + flag, branchée sur la recette
   de tests (sweep + mutations).
9. **State UI** : introduire Zustand (état global non-serveur) + **nuqs** (filtres/recherche en URL
   typés) sur les premières pages listes.
10. **Sécurité xlsx** : migrer SheetJS vers la distribution officielle à jour (ou déporter le
    parsing côté serveur).

---

## Annexe — fichiers livrés par ce spike

```
docs/frontend/refonte-stack-proposition.md                     (ce document)
openapi/operioz.openapi.json                                   (contrat REST clients)
src/interface/http/rest/clients-rest-route.ts                  (route REST + use-cases partagés)
src/interface/http/rest/clients-rest-route.test.ts             (test contrat, DB-free)
src/app.ts                                                     (enregistrement de la route)
src/interface/gateway/migrated-routes.ts                       (registre src + route REST)
functions/_lib/dispatch.mjs                                    (miroir edge + route REST)
client/src/modern/shared/api/{http-client,query}.ts           (client REST typé)
client/src/modern/shared/api/schema.d.ts                       (généré par openapi-typescript)
client/src/modern/features/clients/domain/client.ts           (domaine front)
client/src/modern/features/clients/application/use-clients.ts  (use-case = hook)
client/src/modern/features/clients/ui/ClientsModernPage.tsx    (page, /v2/clients)
client/src/App.tsx                                             (cohabitation legacy/moderne)
package.json                                                   (deps openapi* + script gen:api)
```

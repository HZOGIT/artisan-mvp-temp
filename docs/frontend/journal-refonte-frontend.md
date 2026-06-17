# Journal — boucle autonome « refonte frontend » (clean archi + TanStack Router, tRPC conservé)

> **État persistant de la boucle.** La context window se compacte : ce fichier est la **mémoire de
> travail** relue à CHAQUE réveil (cron 2 min) et écrite à chaque pas. Issu de OPE-403 / OPE-426.
> Agent : `ope-403-refonte-frontend`. Branche : **staging** (rester dessus, PAS de worktree).
> Modèle : Opus 4.8. **Un seul agent** fait la refonte.

## Mission
Migrer le frontend page par page (**strangler fig, no-downtime**) vers la stack définitive (OPE-366) :
clean-archi front + **TanStack Router** + **tRPC 11 conservé** (@trpc/react-query) + primitives
shadcn/ui. Le legacy (wouter) reste servi et **intact** jusqu'à validation de chaque page.

## ⛔ Priorité n°1 — NE RIEN CASSER VISUELLEMENT
**On garde EXACTEMENT la même UI qu'actuellement** (à de petits détails près seulement si ça fait
clairement sens). Une migration de page = **on préserve le markup/JSX et les classes Tailwind à
l'identique**, on ne change QUE la plomberie en dessous (routing, structure clean-archi, accès données).
Toute itération doit prouver la **parité visuelle** (screenshots `/v2/<route>` vs `/<route>` legacy).

## Clean-archi par feature (IMPOSÉE — audit 2026-06-17)
**Décision humaine : « clean-archi + rétrofit total ».** Les ports « fidèles » actuels mélangent
fetch tRPC + logique + présentation dans un seul composant `ui/` (comme le legacy) → NON conforme à la
stack cible. Désormais, **chaque feature** doit avoir :
- `domain/<entity>.ts` : **types dérivés de `RouterOutputs`** (`type Devis = RouterOutputs["devis"]["list"][number]`)
  + règles pures testables. **Bannir `any`** (utiliser les types inférés tRPC).
- `application/use-<feature>.ts` : hook(s) qui **encapsulent tRPC** (queries+mutations), exposent des
  données typées + des actions. **C'est la SEULE couche qui importe `@/modern/shared/trpc`.**
- `ui/*-page.tsx` : **présentation pure** — consomme le hook `use-<feature>`, **n'importe JAMAIS tRPC**.

**Enforcement eslint v2** (à activer au fil du rétrofit) : interdire `@/modern/shared/trpc` dans
`features/**/ui/**` (autorisé seulement dans `application/**`). Tant que des pages legacy-style restent,
la règle est posée en `warn` puis passée en `error` quand tout est rétrofitté.

**Rétrofit total** : les 15 pages déjà migrées sont à refactorer (extraction hook + typage strict),
**1 feature/itération**, en gardant la parité e2e verte. Cf. backlog « Vague R ».

> **🔒 NON NÉGOCIABLE (exigence humaine répétée) — vérifier la conformance à CHAQUE itération.** On veut
> de la **vraie clean-archi**, de la **testabilité unitaire réelle**, du **code propre et modulaire** —
> pas un port qui mélange tout dans l'UI. Chaque itération DOIT exécuter l'**audit de conformance**
> (Runbook §3bis, les 6 cases) et en **consigner le résultat** (journal + Linear). Une itération qui ne
> prouve pas la conformance est **incomplète**, on ne la close pas.

## TypeScript le plus strict possible (imposé — demande humaine)
Le front neuf vise **le TS le plus strict**. `tsconfig.v2.json` (gate) ajoute, au-delà du `strict:true`
hérité : `noUnusedLocals/Parameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
`noImplicitOverride`, `allowUnreachableCode:false`, `allowUnusedLabels:false`. **0 `any`** (règle de la
clean-archi). Le neuf satisfait DÉJÀ `noUncheckedIndexedAccess` (0 erreur dans `client/src/modern`) —
**écrire le code comme s'il était actif** : indexation défensive, pas de `!` non-null, pas d'accès
d'index non gardé. Les 3 flags les plus durs (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`) ne sont pas encore **activés dans le gate** car la traversée
transitive type-check aussi des fichiers **hors périmètre** (`client/src/lib/pdfGenerator.ts`,
`csvExport.ts`, `src/modules/*`) qui portent leur propre dette → suivi : isoler `AppRouter` derrière un
`.d.ts` généré + migrer les utils `lib/` dans `modern/`, puis les activer.

## Query client (React Query) — staleTime par défaut (imposé)
Le `QueryClient` partagé (`client/src/main.tsx`) utilise le **staleTime par défaut de React Query (0)**
(plus de `staleTime: 5min`) → données considérées périmées immédiatement (refetch au remontage/refocus).

## Convention de nommage des fichiers (imposée)
**Tous les nouveaux fichiers du front neuf sont en `kebab-case`** (ex. `clients-list-page.tsx`,
`modern-router-mount.tsx`, `ping-page.tsx`), y compris les fichiers de composants React (le composant
exporté reste en `PascalCase`, seul le nom de fichier est kebab). Cohérent avec les primitives shadcn
(`button.tsx`, `dropdown-menu.tsx`). Renommer au passage tout fichier neuf encore en PascalCase.

## i18n (imposé) — `react-i18next`
**Le front neuf doit être i18n-friendly.** Lib retenue : **`react-i18next`** (i18next). Conventions :
- **Aucune chaîne utilisateur en dur** dans le JSX du neuf → passer par `t("clef")` (hook `useTranslation`).
- Init + provider partagés dans `client/src/modern/shared/i18n/` ; locale par défaut **`fr`** (catalogue
  `fr` = les libellés actuels, à l'identique → parité). `en` ajouté plus tard sans refonte.
- **Un `fr.json` par module/domaine**, **co-localisé** avec la feature : `features/<feature>/i18n/fr.json`
  (le commun = `shared/i18n/common/fr.json`). 1 fichier JSON = 1 **namespace** i18next. On les agrège
  dans `shared/i18n/index.ts` (ajouter l'import + le namespace quand une feature est migrée). `en` plus
  tard = déposer les `en.json` à côté. Clés stables et descriptives ; pluriel via `clef_one`/`clef_other`.
  (tsconfig.v2 : `resolveJsonModule`.)
- Le **gate ESLint v2** fera respecter ceci via `eslint-plugin-i18next` (`no-literal-string`).
- Pages déjà portées avant l'i18n (ex. Clients) → **rétro-i18n** lors du setup i18n (puis le lint passe).

## Périmètre AUTONOME de la boucle (ÉLARGI — demande humaine 2026-06-17)
La boucle touche :
- `client/src/modern/**` (tout le code neuf `/v2`),
- `client/src/main.tsx` / `App.tsx` **uniquement** pour câbler le montage `/v2/*` et le flag (ajouts, jamais de suppression de route legacy),
- `scripts/staging-e2e-mutations.mjs` / `scripts/e2e/**` (cas e2e des routes `/v2` + tooling sweep),
- `tsconfig.v2.json`, ce journal,
- **`src/modules/**` (BACKEND) — NOUVEAU : autorisé pour COMBLER LES GAPS de contrat nécessaires à la
  refonte** (porter/compléter un endpoint, typer un DTO `unknown`, ajouter un champ). Demande humaine :
  « porter TOUS les endpoints backend vers la nouvelle approche ; si gap → itération intermédiaire ».
  Ces itérations backend portent leurs propres **tests vitest backend** (`vitest run src`) + restent
  chirurgicales (mes chemins). On ne « contourne » plus un gap, on le **comble**.

**Toujours HORS boucle (code partagé d'autres agents) :** monorepo OPE-404, garde-fous transverses
(bodyLimit/errorFormatter/tenant OPE-406/409/410), ESLint global OPE-413. En cas de conflit, garder leurs versions.

## Dette à solder (NOUVELLE APPROCHE, humain 2026-06-17)
- **`AbonnementSection`** (Stripe/devices) : actuellement réutilisé tel quel (legacy `@/lib/trpc`). **À PORTER**
  vers l'approche moderne (`feature abonnement` clean-archi via `@/modern/shared/trpc`), **en implémentant
  les gaps backend si besoin** (subscription/devices existent côté new-stack — vérifier la complétude).
- **Réintégrer section vitrine** dans `/v2/parametres` après création des endpoints `vitrine.getSettings/updateSettings` (OPE-504).
- **Findings backend = à combler** (plus seulement filer) : OPE-490 (notes de frais `depenses[]`/`nbDepenses`),
  OPE-504 (vitrine settings), OPE-505 (leads `unknown[]`) → chacun = une itération intermédiaire backend.

## Coordination multi-agents (règle d'or CLAUDE.md)
D'autres agents travaillent sur `staging` (sujets non-front). **Commits chirurgicaux** : `git add`
de MES chemins explicites, **jamais** `-A`/`.`/`-a`. Pas de `reset --hard`/`rebase -i`/`push --force`.
Ne jamais committer/stash un fichier non suivi d'un autre agent. **Après push, re-vérifier
`origin/staging`** (cherry-pick si un reset concurrent a perdu mon commit).

---

## ETA mesuré (demande humaine 2026-06-17)
À CHAQUE itération, (re)lancer `/tmp/eta.sh <itérations_restantes>` (script throwaway, le recréer s'il
manque : médiane des intervalles entre commits `front-v2`/OPE-403 × restantes → ETA daté). Inclure l'ETA
dans le rapport + ntfy. Mesuré : ~6-7 min/itération (sweep par route).

## Runbook d'une itération (idempotent)
```bash
cd /home/developer/artisan-mvp-temp
git fetch origin && git rebase origin/staging || true     # resync ; en cas de conflit sur un fichier
                                                          # d'un autre agent → garder SES versions, que les miennes
./devtools/agents/listen.sh ope-403-refonte-frontend --drain
```
1. **Choisir la cible** = en tête du backlog ci-dessous (vague courante). Le périmètre d'une itération
   est **à ta main** : 1 page simple, ou 1 slice d'une page complexe (liste → détail → formulaire).
   Si tu découbres une complexité, **split** dans le backlog et ne fais qu'un morceau.
1ter. **🔍 AUDIT DE CONTRAT — AVANT TOUT BUILD (imposé, demande humaine 2026-06-17).** Avant d'écrire la
   moindre ligne de la feature, **auditer que le contrat backend new-stack porte TOUT ce que le legacy
   lit/écrit** : pour chaque champ lu (`RouterOutputs[...]`) et chaque mutation (`RouterInputs[...]`),
   vérifier qu'il existe et n'est pas masqué par un `any` legacy. Méthode : lister les `trpc.*` de la page
   legacy, ouvrir les `src/modules/<domaine>/{domain,interface/trpc}`, confronter les champs.
   - **Gap trouvé** (champ/endpoint manquant, type `unknown[]`, écriture droppée…) → **ON LE TRAITE** :
     **NOUVELLE APPROCHE (humain 2026-06-17) — porter TOUS les endpoints backend vers la nouvelle
     approche fait partie de la refonte. Si gap → ITÉRATION INTERMÉDIAIRE qui crée/complète l'endpoint
     backend** (`src/modules/**` — périmètre élargi pour ces itérations), avec ses tests vitest backend,
     PUIS on reprend le build front. Filer quand même un finding Linear pour la trace. Ne PLUS « omettre »
     une section faute de backend : on **comble le gap**.
   - **Pas de gap** → build direct.
2bis. **Sidebar → v2 (imposé)** : ajouter la route au **registre `V2_ROUTES`** (`modern/shared/flag/v2-routes.ts`).
   La sidebar (`DashboardLayout`) résout désormais ses liens via `resolveV2Path()` (câblage unique fait) :
   **dès qu'une route est dans le registre, la navigation de la sidebar pointe automatiquement sur `/v2/<route>`**
   (et l'item reste surligné actif sur `/v2`). Les liens profonds (`/clients` tapé à la main) restent legacy
   sauf flag `?v2=1`. Donc : **inscrire chaque page migrée dans `V2_ROUTES`** (déjà nécessaire pour la bascule).
2. **Implémenter sous `/v2/<route>`** en clean-archi (`modern/features/<domaine>/{domain,application,ui}`,
   data via `@trpc/react-query`, primitives `modern/shared/ui`). **Copier le JSX/Tailwind du legacy à
   l'identique** ; ne réorganiser que la plomberie. **Flag `?v2=1`** câblé. **Legacy intact.**
3. **GATES VERTS (barre obligatoire avant commit) :**
   - `pnpm exec tsc -p tsconfig.v2.json` → vert.
   - `pnpm exec vitest run -c vitest.v2.config.ts` → vert (tests du front neuf).
   - **`pnpm exec eslint -c eslint.v2.config.mjs client/src/modern`** → vert. **Gate ESLint dédié au code
     neuf, enrichi À CHAQUE itération** : on y ajoute des règles (custom au besoin) pour faire respecter
     les specs du neuf — frontière strangler (imports tRPC via `@/modern/shared/trpc`, primitives via
     `@/modern/shared/ui`, jamais `@/lib/trpc`/`@/components/ui` en direct), **pas de REST**
     (openapi-fetch interdit), **kebab-case** des noms de fichiers, etc. Ne lint QUE `client/src/modern/**`
     (n'empiète pas sur l'ESLint global OPE-413).
   - **Parité visuelle — SWEEP PAR ROUTE (imposé, humain 2026-06-17, accélération)** : après deploy, lancer
     **uniquement la route concernée** :
     `./scripts/pw-run.sh scripts/e2e/v2-socle-check.mjs ROUTE=/v2/<route>` (~10-15 s vs ~3 min pour le sweep
     complet ; ne teste que l'entrée `PARITE_PAGES` correspondante, legacy+v2). **Le sweep GLOBAL (sans
     `ROUTE`) ne se relance qu'À LA FIN (recette)** + via le cron 5 min. NB : ajouter l'entrée `PARITE_PAGES`
     AVANT (sinon `ROUTE=` ne matche rien). Au besoin, screenshot `/v2/<route>` ET `/<route>` pour comparer.
   - **e2e mutation** (si la page mute des données) : cas ajouté dans **`scripts/e2e/v2-mutations.mjs`**
     (actions UI réelles → tRPC + assertion de persistance via API, **non destructif** : modifie puis
     REVERT). **rouge avant / vert après**. *(Tests lourds : peuvent être batchés sur un groupe
     d'itérations — voir « Dette de tests » plus bas.)*
3bis. **🔒 AUDIT DE CONFORMANCE CLEAN-ARCHI — OBLIGATOIRE À CHAQUE ITÉRATION (exigence humaine, non
   négociable : « je ne tolérerai plus cette erreur »).** Avant de clore, **vérifier explicitement** et
   **écrire le résultat** (dans le log d'itération + le commentaire Linear) que la cible respecte la
   recette. Checklist à cocher une par une (un seul ❌ = itération NON close, on corrige) :
   - [ ] **3 couches réelles** : `domain/<entity>.ts` (types + règles **pures**) · `application/use-<feature>.ts`
     (hook, **seule** couche tRPC) · `ui/*-page.tsx` (**présentation pure**). Dépendance `ui → application → domain`.
   - [ ] **0 `any`** dans les 3 couches (`grep -nE ': any|as any' <fichiers>` → vide). Types dérivés de `RouterOutputs`/`RouterInputs`.
   - [ ] **`ui/` n'importe PAS `@/modern/shared/trpc`** → le warning `local/no-trpc-in-ui` du fichier **DISPARAÎT**
     (compteur global décroît : noter `N→N-1`).
   - [ ] **Testabilité unitaire RÉELLE** : la logique métier (filtres, calculs, synthèses, règles) vit dans `domain/`
     en fonctions **pures** (sans réseau ni i18n) et est **couverte par des tests vitest** (`<entity>.test.ts`,
     rouge-avant/vert-après pour les règles non triviales). Pas de logique métier non testée laissée dans l'UI.
   - [ ] **Modularité** : pas de fonction fourre-tout ; effets UI (toast/clipboard/navigation/reset) attachés via le
     `onSuccess`/`onError` **par appel** de `.mutate()`, l'invalidation/persistance vit dans le hook.
   - [ ] **Parité visuelle** stricte conservée (JSX/Tailwind inchangés).
   Commande d'auto-contrôle : `grep -rnE ': any|as any' client/src/modern/features/<f>` (vide) +
   `pnpm exec eslint -c eslint.v2.config.mjs client/src/modern | grep -c no-trpc-in-ui` (doit décroître).
4. **Mettre à jour ce journal** : cocher la cible, fixer la suivante, noter tout split/blocage **+ consigner
   le résultat de l'audit 3bis** (les 6 cases).
5. **Diffuser** : `./devtools/testing-loop/broadcast.sh <tag> "<titre>" "<message>"` (journal+ntfy+bus).
   **Le message DOIT inclure un % de progression** (demande humaine) — format `📊 X% (N/M pages)` où
   `N` = pages migrées, `M` = total legacy. Calcul :
   `N=$(ls client/src/modern/features/*/ui/*-page.tsx | grep -v _demo | wc -l)`,
   `M=$(ls client/src/pages/*.tsx | wc -l)`, `X=$((N*100/M))`.
6. **Commit UNIQUE chirurgical** (`git add <mes chemins>`) → `git push origin staging` → **re-vérifier
   `origin/staging`**. Message `feat(front-v2): <quoi>` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
7. **Déployer le SPA** si le bundle a changé (page migrée) : `./devtools/deploy-staging-pages.sh`.
   (Squelette/tsconfig/test pur → pas de déploiement.)
8. **Linear** : commentaire « migré: <page> ✅ » sur l'issue de la vague (OPE-421→424).

## Reprise sur erreur (ne jamais bloquer la boucle)
- Gate rouge à cause d'un vrai bug runtime → fix **minimal**, tag `fix`, déployer, signaler.
- Cible trop grosse → split dans le backlog, n'en faire qu'un morceau.
- Bloqué (parité ambiguë, dépendance hors-périmètre) → `broadcast.sh blocked` + `notify human BLOCKED`,
  marquer la cible 🚧 et passer à la **suivante migrable**.

## Dette de tests (batch autorisé)
Les e2e lourds peuvent être **batchés** : migrer un groupe de pages simples (parité visuelle + tsc + vitest
verts à chaque pas), puis consacrer **une itération dédiée** à écrire/adapter le lot d'e2e mutations du
groupe. Ne jamais batcher la **parité visuelle** ni le **typecheck** (à chaque itération).

---

## Backlog (ordre = priorité). ✅ fait · 🚧 bloqué · ⬜ à faire

### Vague 0 — Socle (front-additif, visuellement neutre) — ✅ TERMINÉE (S1→S4)
- [x] **S1** TanStack Router monté sur `/v2/*` cohabitant avec wouter (QueryClient + auth partagés ; error/pending par route ; lazy). Une route `/v2/ping` de démonstration. *(OPE-415)* — `@tanstack/react-router@1.170.16` ajouté ; socle dans `modern/shared/router/{router.tsx,ModernRouterMount.tsx}` (routage par code, `basepath:/v2`, pending+error+notFound par défaut) ; câblé via catch-all wouter `/v2/:rest*` dans `App.tsx` (DANS `AuthenticatedRoutes` → providers+auth partagés). L'ancien PoC `/v2/clients` repris sous le socle ; démo `/v2/ping`. tsc v2 ✅, `vite build` ✅.
- [x] **S2** Helper de flag `?v2=1` + util de bascule par route (ouvre `/v2/<route>`, sinon legacy). *(OPE-420)* — `modern/shared/flag/` : `v2-flag.ts` (lecture `?v2=1`/`=0`, persistance localStorage « collante », cœur pur `readV2FlagFromSearch`), `v2-routes.ts` (registre `V2_ROUTES` legacy→/v2 + `resolveV2Path`/`isV2Path`), `use-v2-bascule.ts` (hook wouter sans rendu : redirige si flag actif ET route migrée, sinon no-op). Câblé via `useV2Bascule()` dans `AuthenticatedRoutes` (App.tsx). Tests vitest dédiés (`vitest.v2.config.ts`, 12 cas) + e2e `scripts/e2e/v2-socle-check.mjs` étendu (legacy reste legacy / `?v2=1` bascule). tsc v2 ✅, vitest v2 ✅, e2e 0 issue, déployé.
- [x] **S3** Squelette clean-archi + **client tRPC partagé** (`modern/shared/trpc`). *(OPE-419)* — `modern/shared/trpc/index.ts` réexpose l'instance `trpc` legacy unique (provider/QueryClient/auth/superjson partagés) + types `RouterInputs`/`RouterOutputs` inférés de `AppRouter`. Feature `clients` **migrée REST→tRPC** : domaine `Client = RouterOutputs["clients"]["list"][number]`, application `trpc.clients.list.useQuery()`, UI inchangée. **REST supprimé** (`modern/shared/api/*` + openapi-fetch retirés du neuf) → **dette OPE-366 résorbée**. `tsconfig.v2.json` : `types` += `@fastify/cookie` (augmentation chargée car tsc traverse la source backend via AppRouter). Test domaine `nomComplet` ajouté. tsc v2 ✅, vitest v2 16 ✅, e2e `cas testés:4 | issues:0` ✅, déployé.
- [x] **S4** Primitives `modern/shared/ui` = **copie conforme** des composants UI legacy utilisés par la Vague 1 (zéro changement visuel). *(OPE-416, périmètre réduit)* — `modern/shared/ui/{button,input,card,label,dropdown-menu}.ts` = **ré-export** des primitives legacy `@/components/ui/*` (composant identique → parité pixel garantie, zéro drift) + barrel `index.ts`. Surface = primitives utilisées par `pages/Clients.tsx` (Vague 1). Test garde-fou de surface (`index.test.ts`). tsc v2 ✅, vitest v2 17 ✅. **Pas de déploiement** (ré-export non encore consommé par le runtime → bundle inchangé). Relocalisation physique des primitives = à la suppression finale du legacy.

### Vague 1 — rodage (lecture, fort trafic, UI simple) *(OPE-421)* — ✅ TERMINÉE (6/6)
- [x] **Clients → `/v2/clients`** (port conforme de `pages/Clients.tsx`) — **page complète** (header, recherche, bandeau doublons, cartes + badge encours + étiquettes, menu actions, modal édition) portée à l'identique (JSX/Tailwind copiés), plomberie repointée : primitives `@/modern/shared/ui` + tRPC `@/modern/shared/trpc` (data déjà tRPC côté legacy → contrat inchangé). PoC `ClientsModernPage` + `use-clients.ts` supprimés. Renommage kebab-case (`clients-list-page.tsx`, `modern-router-mount.tsx`, `ping-page.tsx`). tsc v2 ✅ (corrigé : `target ESNext` + handler `<select>`), vitest v2 17 ✅, **parité e2e `cas:6 | issues:0`** (marqueurs identiques legacy vs /v2 + barre de recherche + bascule), déployé.
  - ⏳ **Dette batchée** : e2e **mutation** (modal édition : modifier Notes → save → persistance → revert) à ajouter dans une itération e2e dédiée (mutations byte-identiques au legacy, contrat tRPC `clients.update/delete` déjà couvert backend). Cf. « Dette de tests (batch autorisé) ».
- [x] ClientDetail → `/v2/clients/:id` — port conforme de `pages/ClientDetail.tsx` (`client-detail-page.tsx`), i18n (namespace `clients` étendu) + kebab + primitives partagées (select/tabs/badge…), route enfant TanStack `/clients/$id`. **Refactor correctif** : split gate de chargement externe + contenu interne (le legacy appelait des hooks après early-returns → React #310 ; le legacy `/clients/:id` PLANTE — corrigé côté v2). 4 gates verts, e2e `9|0` (rendu /v2 OK). Déployé.
  - 🐞 **Fix socle** : wouter catch-all `/v2/:rest*` ne matchait PAS les routes imbriquées (`/v2/clients/4` → 404 legacy) → corrigé en **`/v2/*`** (App.tsx). Toutes les routes `/v2/<a>/<b>` fonctionnent désormais.
  - 🐞 **Finding legacy** : `pages/ClientDetail.tsx` est CASSÉ en prod (hooks après early-return → #310, plante via ErrorBoundary). Le port v2 corrige. À remonter (legacy sera supprimé, mais bug actif d'ici là).
- [x] Articles → `/v2/articles` — port conforme de `pages/Articles.tsx` (`articles-page.tsx`), i18n (namespace `articles`, ~90 clés : métiers/catégories/sous-catégories/unités/TVA) + kebab + primitives partagées (dialog/select/dropdown-menu/textarea/badge). 3 dialogs (créer/éditer, suppression, import CSV preview) + table native. 4 gates verts, **parité e2e `15|0`**, déployé.
- [x] Fournisseurs → `/v2/fournisseurs` — port conforme de `pages/Fournisseurs.tsx` (`fournisseurs-page.tsx`), i18n (namespace `fournisseurs`) + kebab + primitives partagées (dialog/table/textarea/badge). 4 dialogs (création/édition/articles/association). Route TanStack + registre bascule. 4 gates verts, **parité e2e `13|0`**, déployé.
  - 🐞 **Finding legacy** : `pages/Fournisseurs.tsx` se ré-enveloppe dans `<DashboardLayout>` alors qu'il est DÉJÀ rendu dans le DashboardLayout d'AuthenticatedRoutes → **double chrome** (DashboardLayout n'a pas de garde anti-imbrication). Le port v2 **supprime** ce double layout (rendu propre). À remonter.
- [x] Techniciens → `/v2/techniciens` — port conforme de `pages/Techniciens.tsx` (`techniciens-page.tsx`), i18n (namespace `techniciens`) + kebab + primitives partagées (dialog/select/table/badge). Route TanStack + registre bascule. 4 gates verts, **parité e2e `11|0`**, déployé.
- [x] Notifications → `/v2/notifications` — port conforme de `pages/Notifications.tsx` (`notifications-page.tsx`), i18n (namespace `notifications`) + kebab + primitives partagées. Primitives `badge`/`scroll-area` ajoutées au barrel. Bascule registre + route TanStack. 4 gates verts, **parité e2e `8|0`**, déployé.

### Vague 2 — listes + mutations *(OPE-422)* — détailler en slices au moment venu
Devis · Factures · Interventions · Commandes · Stocks · Dépenses.

### Vague 3 — critique/public *(OPE-423)*
- [x] **Comptabilité → `/v2/comptabilite`** (~673 l., lecture seule) — conformité FEC + filtres période + TVA/CA3 + 4 onglets + aperçu FEC. i18n, double-layout supprimé. Parité e2e `31|0`.
- [x] **Socle `/v2` PUBLIC** (hors auth) + **Paiement** : `modern/shared/router/public-router.tsx` + `public-router-mount.tsx` (2ᵉ arbre TanStack basepath `/v2`, monté dans le `Router` public de `App.tsx` avant le catch-all authentifié). Pages `PaiementSucces`/`PaiementAnnule` portées (`paiement-{succes,annule}-page.tsx`, i18n namespace `paiement`). Routes `/v2/paiement/{succes,annule}`. 4 gates verts, parité e2e `33|0`, déployé.
- [x] **Signature → `/v2/signature/:token`** (+ alias `/v2/devis-public/:token`) — port conforme `pages/SignatureDevis.tsx` (`signature-devis-page.tsx`, ~605 l., PUBLIC), i18n namespace `signature` (libellés legacy sans accents conservés). Canvas de signature, options/formules, refus, états (loading/erreur/déjà traité/confirmation). Primitives `checkbox`/`separator` ajoutées au barrel. Token via TanStack. **Finding** : le legacy lisait `devis.dateDevis` (inexistant → « Invalid Date ») → corrigé en `createdAt`. 4 gates verts, e2e `37|0` (montage déterministe ; flow signé = dette). Déployé.
- [ ] Dashboard (~16 widgets legacy → stratégie à définir) · Portail (public, socle prêt) · Abonnement.

### Vague 4 — longue traîne + **suppression du legacy** *(OPE-424)*
Reste des pages → bascule routeur racine sur TanStack Router → **suppression complète de l'ancien code**
(wouter + pages legacy migrées) une fois TOUT confirmé. *(C'est l'objectif final : on supprimera
l'ancien code entièrement quand la parité est validée partout.)*

## 🏁 VAGUE R TERMINÉE (14/14 features clean-archi) — `local/no-trpc-in-ui` est passé en **`error`**
La frontière clean-archi est **verrouillée** : toute page `features/<f>/ui/**` qui importe `@/modern/shared/trpc`
fait **échouer** le gate ESLint v2. Désormais chaque nouvelle page naît clean-archi (domain pur + application =
seule couche tRPC + ui présentation, 0 `any`). Bilan : **5 bugs UI réels** trouvés via le typage strict
(OPE-465→469), tous parqués dans « Refonte — findings & dette repérés ».

- **Migration clean-archi — `parametres` ✅ (DERNIÈRE page, gros multi-domaine)** : migrée de `pages/Parametres.tsx` (onglets général + abonnement). `domain/parametres.ts` (types `RouterOutputs`/`Inputs` + mappers PURS `parametresToForm`/`formToUpdateInput` + `buildIcalUrl`/`demandeStatutClass` ; **6 tests**) + `application/use-parametres.ts` (SEULE couche tRPC : parametres.get + artisan.getProfile + calendrier.getIcalFeed + vitrine.getDemandesContact + mutations update/updateProfile/regenerateIcal/updateDemandeStatut/convertirDemande) + `ui/parametres-page.tsx` (présentation pure, **0 `any`** — supprime les 3 `any` legacy ; logo via `fetch('/api/upload-logo')` REST ; deep-link `?tab=abonnement` + toasts `?success`/`?canceled` via `window.location`+`history.replaceState`). **Réutilise `@/components/AbonnementSection`** (Stripe/devices, legacy trpc — fonctionne car le routeur neuf partage les providers legacy ; portage propre = slice futur). **⚠️ Sous-section « réglages vitrine » OMISE TEMPORAIREMENT** (finding OPE-504). **DÉCISION HUMAINE (2026-06-17) : on CRÉE les endpoints backend nécessaires (`vitrine.getSettings`/`updateSettings` couvrant `vitrineActive`/`Description`/`Zone`/`Services`(JSON)/`Experience`) pour PARACHEVER la refonte → puis RÉINTÉGRER la section vitrine dans `/v2/parametres`.** ⟶ **À FAIRE À LA REPRISE** : dès qu'OPE-504 livre les endpoints, (1) ajouter les champs vitrine au `ParametresForm` + mappers `parametresToForm`/`formToUpdateInput` (ou un form/hook vitrine dédié si `updateSettings` est séparé de `parametres.update`), (2) re-rendre la carte « Ma page vitrine » (active/slug déjà géré via artisan/`getProfile`, description/zone/services/expérience), (3) tests domain + entrée sweep marqueur « Ma page vitrine », (4) parité visuelle stricte avec le legacy. Voir [[v2-bascule-real-legacy-path]]. **Finding OPE-505** : `getDemandesContact` renvoie `unknown[]` → type `DemandeContact` local + assertion (sans `any`). Câblage route + V2_ROUTES + i18n + sweep e2e + maj `v2-routes.test` (non-migré → `/dashboard`). **Audit §3bis 6/6 ✅** (sauf section vitrine omise, documentée). tsc/eslint(0 err)/vitest **189**.

- **Itération INTERMÉDIAIRE BACKEND — `vitrine.getSettings`/`updateSettings` ✅ (comble OPE-504)** : 1ʳᵉ itération du périmètre backend élargi. Expose la lecture+écriture ADMIN des colonnes `vitrine*` de `parametres_artisan` (scopé tenant, RLS, upsert idempotent — pattern `ParametresRepositoryDrizzle`). Fichiers : `domain/vitrine-settings.ts` + `application/vitrine-settings-repository.ts` + `settings-use-cases.ts` (+ **4 tests** fake) + `infra/…-drizzle.ts` + `…-fake.ts` + procédures router `getSettings`/`updateSettings` (zod) + wiring `app.ts`. **Déployé new-stack** (`deploy-staging-newstack.sh`, smoke OK) + **vérifié au navigateur authentifié** (getSettings 200 → données réelles ; updateSettings 200 → écrit/relit ; **mutation de test revertée**). 0 nouvelle erreur tsc `src/`. ⟶ **DÉBLOQUE la réintégration de la section « Ma page vitrine » dans `/v2/parametres`** (prochaine cible). NB : `pages/MaVitrine.tsx` (legacy) lit aussi ces champs (même gap, dette legacy pré-existante).
- **Modernisation — `abonnement` ✅ (dette soldée, demande humaine)** : port de `@/components/AbonnementSection` (legacy `@/lib/trpc`) vers une feature clean-archi `abonnement` (`@/modern/shared/trpc`). **Audit de contrat GREEN** (subscription + devices 100% en new-stack : getCurrent/createCheckout/createPortal/cancel/reactivate + devices.list/revoke/revokeAll ; tous les champs présents → l'unique `any` legacy `d:any` résolu via type `Device`). `domain/abonnement.ts` (catalogue `PLANS` + helpers PURS `calcPrice`/`isCurrentPlan`/`trialColorTier`/`trialProgressPct`/`relativeTime`/`planLabel` ; **9 tests**) + `application/use-abonnement.ts` (SEULE couche tRPC : getCurrent + devices.list + 6 mutations) + `ui/abonnement-section.tsx` (présentation pure, **0 `any`**, i18n complet, redirections Stripe via onSuccess). **`/v2/parametres` importe désormais la section MODERNE** (plus de `@/components/AbonnementSection`). Frontend-only (aucun gap backend). tsc/eslint(0 err)/vitest **207**.
- **Migration clean-archi — `dashboard` ✅ (gros chantier, thin-shell)** : migré de `pages/Dashboard.tsx` (711 l., 3 états adaptatifs nouveau/démarrage/confirmé). **Audit de contrat AVANT build = GREEN** (5 endpoints existent ; `getConversionRate`→`number`, `getObjectifs.objectifCA`→`number`, `getAlerts`≡`DashboardAlert`, `user.name`←`auth.me` → les 5 `any` legacy résolus sans gap backend). `domain/dashboard.ts` (PUR : `computeDashboardState`/`resolveWidgetOrder`/`parseHidden`/`visibleWidgetIds`/`firstNameOf`/`formatEUR` ; **9 tests**) + `application/use-dashboard.ts` (SEULE couche tRPC : getStats/getConversionRate/getAlerts/getObjectifs + artisan.getProfile + auth.me ; staleTime legacy) + `ui/dashboard-page.tsx` (3 états, **0 `any`**, **réutilise les ~17 widgets `@/components/dashboard/**` zéro-prop** + WelcomeBanner/AlertsBar/StatCard/QuickActions/CustomizePanel/ConseillerIAWidget ; localStorage order/hidden). i18n complet (incl. labels widgets). **Sidebar « Accueil » → `/v2/dashboard`** (V2_ROUTES) ; sweep sidebar + v2-routes.test mis à jour. **Audit §3bis 6/6 ✅** (clean-archi widget-par-widget = slices futurs, documenté). tsc/eslint(0 err)/vitest **198**.

- **Type-fix backend+front — leads `DemandeContact` typés ✅ (OPE-505 résolu, type-only)** : `vitrine.getDemandesContact`/`LeadRepo.list` typés `DemandeContact[]` (le repo `demandes-contact` renvoyait déjà ce DTO) au lieu de `unknown[]`. Front : `type DemandeContact = RouterOutputs["vitrine"]["getDemandesContact"][number]` (dérivé) → **suppression de l'interface locale + de l'assertion `as DemandeContact[]`**. **Changement TYPE-ONLY** (0 changement runtime : le repo renvoyait déjà la bonne forme, le front lisait déjà les bons champs) → pas de déploiement nécessaire. Backend tsc 0 nouvelle erreur + vitrine 24 tests ; front tsc/eslint 0, vitest **212**.
- **Réintégration — section « Ma page vitrine » dans `/v2/parametres` ✅ (OPE-504 bouclé front+back)** : la section omise est REVENUE, consommant les endpoints backend livrés. `domain/parametres.ts` : types `VitrineSettings`/`UpdateVitrineSettingsInput` (`RouterOutputs/Inputs["vitrine"]`) + champs vitrine dans `ParametresForm` + mappers PURS `parseVitrineServices`/`serializeVitrineServices` (JSON array ↔ lignes textarea), `applyVitrineToForm`, `formToVitrineInput` (**5 tests**). `application/use-parametres.ts` : `vitrine.getSettings` + `vitrine.updateSettings` (invalidation). `ui/parametres-page.tsx` : carte « Ma page vitrine » rendue (activation + slug + description + zone + expérience + services), enregistrée avec le submit général (3ᵉ mutation). Sweep marqueur « Ma page vitrine » ajouté. tsc/eslint(0 err)/vitest **212**. ⟹ **`/v2/parametres` est désormais 100% fonctionnel (plus aucune section omise) ; OPE-504 entièrement bouclé.**

- **Itération INTERMÉDIAIRE BACKEND — notes de frais enrichies ✅ (comble OPE-490)** : `getNoteFraisById` enrichi des **`depenses[]`** (détails liés), `listNotesFrais` enrichi de **`nbDepenses`**, `createNoteFrais` **honore `depenseIds`** (cascade `addDepenseLink`, anti-IDOR + recalcul montant). Repo : `getDepensesForNote`/`countDepensesByNote` (join `notes_frais_depenses ⋈ depenses` existant + fake) ; read use-cases composés `getNoteFraisDetail`/`listNotesDeFraisAvecCompte` (parité : détail **null** hors tenant, pas 404) ; router rewire (`depenses.router.ts`). Types domaine `NoteFraisDepense`/`NoteDeFraisDetail`/`NoteDeFraisListItem`. **4 tests**. **Déployé new-stack** (smoke OK) + **vérifié au navigateur authentifié** (listNotesFrais → `nbDepenses` présent ; getNoteFraisById → `depenses[]` présent). 0 nouvelle erreur tsc. ⟹ **DÉBLOQUE la re-migration front de la page `notes-frais`** (était reportée).

- **Migration clean-archi — `notes-frais` ✅ (débloquée par OPE-490, OPE-490 entièrement bouclé)** : migrée de `pages/NotesFrais.tsx` (liste + détail workflow + dépenses incluses + add/remove). **0 `any`** — le contrat backend complet (depenses[]/nbDepenses, livré à l'itération précédente) a permis de dériver tous les types (le legacy avait `d:any`/`n:any` masquant le gap). `domain/note-frais.ts` (types `RouterOutputs` + helpers PURS `eur`/`fmtDate`/`etapeReached`/`availableBrouillons`/`filterBrouillon` ; **6 tests**) + `application/use-notes-frais.ts` (SEULE couche tRPC : list + detail(selectedId) + depenses brouillon + 7 mutations workflow/liens) + `ui/notes-frais-page.tsx` (vue liste/détail, timeline, dialogs, i18n). **Finding mineur géré** : `depenses.list` new-stack n'a pas de filtre `statut` → on charge tout + `filterBrouillon` côté front (parité). Câblage route + V2_ROUTES (`/notes-de-frais` = vrai chemin legacy) + i18n + sweep `ROUTE`. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **217**. ⟹ **OPE-490 entièrement bouclé (back + front)**.

- **Portail client — SLICE 1 (socle) ✅** : route PUBLIQUE `/v2/portail/$token` (public-router + App.tsx `PublicModernRouterMount`). `domain/portail.ts` (`VerifyAccess` dérivé + `PORTAIL_TABS`, 1 test) + `application/use-portail-access.ts` (SEULE couche tRPC : `verifyAccess`) + `ui/portail-client-page.tsx` (gate : chargement / **lien invalide-expiré** / espace valide = en-tête artisan + coquille 8 onglets, contenu « section à venir » remplacé slices 2-6). **0 `any`**, i18n complet. Sweep `PARITE_PAGES` : token bidon → « Lien expiré ou invalide » des 2 côtés (parité du gate). Non lié au trafic réel. tsc/eslint(0)/vitest **218**.

- **Portail client — SLICE 2 (Devis + Factures + paiement Stripe) ✅** : onglets Devis (`getDevis`) + Factures (`getFactures`) remplis. `domain` : types `PortailDevis`/`PortailFacture` dérivés + helpers PURS `formatCurrency`/`devisStatutClass`/`factureStatutClass`/`isFacturePayable` (**4 tests**). `application/use-portail-documents.ts` (getDevis + getFactures, gated `access.valid`). `ui` : cartes devis (PDF + lien signer) + factures (PDF + **« Payer en ligne »** → REST `/api/paiement/create-checkout-session` → redirect Stripe) + retour `?paiement=succes|annule` (toast + onglet factures). **0 `any`**, i18n. **Sweep** : whitelist des **401 attendus** `clientPortal.*` (token invalide → Unauthorized par design ; le legacy les déclenche). tsc/eslint(0)/vitest **222**. (Valid-state non sweepable sans token réel → couvert par tsc + tests + contrat.)

- **Portail client — SLICE 3 (Interventions + Suivi chantiers + footer) ✅** : onglets Interventions (`getInterventions` : prochaine intervention en avant + liste, badges statut) + Chantier (`getSuiviChantiers` : cartes avec `Progress` avancement + timeline d'étapes) + **footer** (coordonnées artisan). `domain` : types `PortailIntervention`/`PortailChantier` + helpers PURS `interventionStatutClass`/`chantierStatutClass`/`prochaineIntervention` (**2 tests**). `application/use-portail-activity.ts` (gated). Primitive `progress` ajoutée au barrel. **0 `any`** (les 2 `any` legacy chantier/etape supprimés via types dérivés). tsc/eslint(0)/vitest **224**.

- **Portail client — SLICE 4 (Prise de RDV) ✅** : onglet RDV — wizard 3 étapes (Description → Créneau → Confirmation) + « Mes rendez-vous ». `domain` : types `PortailRdv`/`RdvUrgence` + helpers PURS `groupSlotsByDay` (créneaux groupés par jour) + `rdvStatutClass` (**2 tests**). `application/use-portail-rdv.ts` (`getCreneauxDisponibles` + `getMesRdv` + `demanderRdv`, gated + invalidation). `ui` : wizard (form titre/description/urgence → grille créneaux par jour → confirmation → `demanderRdv`) + success + liste RDV avec badges. **0 `any`** (1 any legacy urgence supprimé via `RdvUrgence`). tsc/eslint(0)/vitest **226**.

- **Portail client — SLICE 5 (Messages / Chat) ✅** : onglet Messages — liste conversations + thread + envoi + poll 10 s. **Audit contrat a révélé un gap** (DTO chat portail trop étroit) → **comblé en type-only backend** (les champs existaient au runtime, type élargi comme OPE-505) : `chat-use-cases.ts` — `PortalChatMessage` + `createdAt`, nouveau `PortalChatConversationSummary` (id/clientId/sujet/nonLuClient/dernierMessage/dernierMessageDate) → `getConversations`/`ChatRepoForPortal.listConversations` élargis (le repo chat migré renvoyait déjà ces objets). 0 changement runtime → pas de deploy newstack. `domain` : types `PortailConversation`/`PortailMessage` + helpers PURS `totalUnread`/`formatChatDate` (**2 tests**). `application/use-portail-chat.ts` (`getConversations` + `getConversationMessages` via **skipToken** + `sendClientMessage` ; refetch poll/onSuccess). `ui` : liste convs (sujet/non-lus/aperçu) + thread (bulles client/artisan, auto-scroll) + form envoi + badges non-lus sur onglet. Primitive `scroll-area` déjà au barrel. **0 `any`**. tsc/eslint(0)/vitest **228**.

- **Portail client — SLICE 6 (Demande IA + Mes infos) ✅ → PORTAIL COMPLET 6/6** : onglet Demande IA (`soumettreDemandeIA` : chips d'exemples + textarea + compteur + résultat structuré titre/type/urgence/estimation/reformulée/questions) + onglet Infos (`getClientInfo` : coordonnées + `demanderModification` : formulaire). **Audit contrat OK** (DTO `ClientInfoResult`/`DemandeIAStructured` complets, 0 gap). `domain` : `DemandeStructured`/`PortailClientInfo` + `EXEMPLES_DEMANDE`/`demandeValide` (**2 tests**). `application/use-portail-infos.ts` (getClientInfo gated) + `use-portail-demande.ts` (soumettreDemandeIA + demanderModification). **0 `any`**. tsc/eslint(0)/vitest **230**. → **Les 8 onglets du portail sont migrés.**

## ETA GLOBAL — déprécier complètement l'ancienne approche (ne reste que le code propre)
La boucle vise l'état final **strangler-fig terminé** : v2 par défaut + **legacy supprimé**, pas seulement
« pages migrées ». Le compteur `REMAINING` de `/tmp/eta.sh` couvre désormais TOUTES les phases restantes :
1. **Home** marketing (`/`) — dernière page legacy à porter.
2. **Cutover lien portail backend** → emails pointent `/v2/portail/<token>` (au lieu du legacy).
3. **Bascule v2 par défaut** — retirer l'opt-in `?v2=1` ; toutes les routes servent v2 ; **sweep global** de validation (toutes routes vertes).
4. **Suppression du legacy** — supprimer `client/src/pages/**`, le routing wouter, `@/lib/trpc` une fois
   inutilisés (les composants partagés encore consommés par v2 — Calendar, widgets dashboard — restent).
   Plusieurs itérations (suppression prudente + revérif sweep à chaque coupe).

- **Home — page vitrine (`/v2/home`, legacy `/`) ✅ port COMPLET + i18n** : page marketing statique (1624 l., 0 endpoint serveur) portée en clean-archi : `application/use-home-auth.ts` (auth via le client tRPC neuf `auth.me`, remplace le `useAuth` legacy couplé wouter + `@/lib/trpc`) ; `domain/home.ts` (`priceFor` mensuel/annuel −20% + `SECTION_COUNTS`, **2 tests** dont cohérence i18n↔sections) ; `i18n/fr.json` **namespace `home` — extraction i18n complète** (nav, hero, mockup, features, illustrations, sectors, how, pricing, testimonials, faq, cta, footer + `brand`) ; `ui/home-page.tsx` réécrit avec `useTranslation("home")` partout (tableaux i18n via `returnObjects` zippés avec les données structurelles icônes/accents). Routing : route publique `/home` (public-router) + montage `App.tsx` `/v2/home` + `V2_ROUTES["/"]="/v2/home"` (test v2-routes mis à jour : `/`→`/v2/home`). Markup/classes Tailwind **à l'identique** (parité). **0 `any`**. tsc/eslint(0)/vitest **232**.

- **Bascule v2 PAR DÉFAUT ✅** (strangler-fig — phase 2) : précédée d'un **sweep global VERT (73 routes, 0 issue)** sur la staging déployée → flip du défaut du flag. `v2-flag.ts` : nouveau résolveur PUR `resolveV2Enabled(fromUrl, stored)` — l'URL prime (`?v2=1`/`?v2=0`), sinon **défaut ACTIVÉ** sauf opt-out explicite mémorisé `"0"` (escape hatch / rollback). `isV2Enabled` délègue au résolveur ; `readPersistedRaw` lit le brut. **3 tests** ajoutés. Désormais toute route legacy migrée redirige vers `/v2/<route>` sans `?v2=1`. Staging uniquement → risque contenu ; legacy encore servi comme filet. tsc/eslint(0)/vitest **235**.

- **Cutover FRONT des pages publiques par token ✅** (phase 3a, sans backend) : dans `App.tsx`, les routes legacy `/signature/:token`, `/devis-public/:token`, `/portail/:token` redirigent désormais vers `/v2/...` **quand `isV2Enabled()`** (défaut ON) — **query string préservée** (le retour Stripe `?paiement=succes` arrive donc sur le portail v2 slice 2). `?v2=0` garde le legacy (escape hatch). Les liens emails (qui pointent encore `/portail/<token>`) atterrissent ainsi sur le front neuf **sans toucher au backend**. tsc.v2 0 (App.tsx : 0 erreur nouvelle ; 1 erreur legacy pré-existante `/portail-gestion` non liée) / vitest **235**. (eslint.v2 ne couvre pas `App.tsx` legacy.)

- **Suppression legacy — 1ère coupe : pages publiques par token ✅** (phase 3b) : supprimé `client/src/pages/SignatureDevis.tsx` + `client/src/pages/PortailClient.tsx` (entièrement migrées : signature + portail 6/6 ; sweep-validées). Redirections publiques rendues **inconditionnelles** dans `App.tsx` (plus de fallback `?v2=0` pour ces 3 routes) + imports lazy + import `isV2Enabled` retirés. **Méthode de sécurité (build partagé)** : ces pages n'étaient importées QUE par `App.tsx` (grep) ; après coupe, `tsc -p tsconfig.json` **211** (← 213, **−2**, aucune nouvelle erreur) + 0 import résiduel. tsc.v2 0 / vitest **235**.

## ⚠️ CORRECTION D'ÉTAT (2026-06-17) — « toutes les pages migrées » était FAUX
Audit réel (App.tsx vs V2_ROUTES vs features modernes) : **89 fichiers `pages/` legacy restent** (2 supprimés :
PortailClient, SignatureDevis). **30 domaines cœur migrés** (V2_ROUTES). MAIS **~20 pages FEATURE n'ont
AUCUN équivalent moderne** (vrai legacy non migré) : `assistant`, `assistant/conversations`, `chat`,
`geolocalisation`, `planification`, `rapports`, `previsions`, `vehicules`, `badges`, `alertes-previsions`,
`chantiers`, `calendrier-chantiers`, `devis-ia`, `analyses-photos`, `classement`, `ma-vitrine`,
`rdv-en-ligne`, `modeles-email(-transactionnels)`, `performances-fournisseurs`, `tableau-bord-depenses`,
`tableau-bord-sync-comptable`, `integrations-comptables`, `documentation`, `import`, `import-releve`,
`rapport-commande`, `devis-ia`. + pages **auth/légal** (sign-in/up, forgot/reset, mentions/cgu/cgv/confid/
contact/aide/guide). + sous-routes détail/création (certaines migrées dans le routeur v2, à vérifier).
La **sidebar est le `DashboardLayout` legacy** → ses liens pointent legacy ; pour les 30 migrés la bascule
redirige, pour les ~20 non migrés ça reste 100% legacy (ce que l'humain voit).

- **Migration `chat` (messagerie artisan ↔ client) ✅** (1ère des ~20 pages feature non migrées) : audit
  contrat OK (8 endpoints `chat.*` + `clients.list` déjà dans le new-stack, 0 gap). Clean-archi :
  `domain/chat.ts` (types dérivés + `filterConversations`/`clientLabel`/`normalize`/`formatChatDate`, **6 tests**) +
  `application/use-chat.ts` (getConversations/getMessages[skipToken]/sendMessage/startConversation/archive/
  close/reopen + clients.list, poll 10s) + `ui/chat-page.tsx` (liste filtrable + thread + dialog nouvelle conv,
  markup à l'identique). i18n namespace `chat`. Primitive `avatar` ajoutée au barrel. Route `/v2/chat`
  (router.tsx) + `V2_ROUTES["/chat"]` + entrée sweep. **0 `any`**. tsc/eslint(0)/vitest **241**.

- **Migration `badges` (gamification techniciens) ✅** (2e des ~20 pages feature) : audit contrat OK
  (`badges.{list,create,getClassement,calculerClassement}` + `techniciens.getAll` déjà câblés dans
  `src/interface/trpc/router.ts`, 0 gap). Clean-archi : `domain/badges.ts` (types dérivés + `categorieClass`/
  `rankMedal`/`progressPct`/`maxPoints`/`technicienLabel`, **6 tests**) + `application/use-badges.ts` (list +
  classement[periode] + techniciens + create + calculerClassement) + `ui/badges-page.tsx` (3 onglets
  Badges/Classement/Objectifs + dialog création, markup à l'identique, **3 `any` legacy supprimés** via
  types dérivés/helpers). i18n namespace `badges`. Route `/v2/badges` + `V2_ROUTES["/badges"]` + sweep.
  **0 `any`**. tsc/eslint(0)/vitest **247**.

- **Migration `classement` (gamification : podium + tableau + badges/objectifs) ✅** (3e des ~20 pages
  feature) : audit contrat — `badges.{getClassement,calculerClassement,getBadgesTechnicien,getObjectifsTechnicien}`
  + `techniciens.getAll` présents. **Gap détecté & comblé SANS backend** : `getBadgesTechnicien` ne renvoie
  que le lien brut (id/badgeId/dateObtention), PAS nom/couleur/points (que le legacy lisait via `any`) →
  **jointure côté client** avec `badges.list` (`enrichBadgesTechnicien`, domain pur testé). Clean-archi :
  `domain/classement.ts` (eur/initials/technicienName/buildRanking/splitPodium/objectifPct/enrichBadgesTechnicien,
  **8 tests**) + `application/use-classement.ts` (2 hooks : classement + détail technicien via skipToken) +
  `ui/classement-page.tsx` (podium framer-motion + tableau + badges + objectifs, markup à l'identique, **~7
  `any` legacy supprimés**). i18n namespace `classement`. Route `/v2/classement` + V2_ROUTES + sweep. **0 `any`**.
  tsc/eslint(0)/vitest **255**.

- **Migration `modeles-email` (modèles d'emails) ✅** (4e des ~20 pages feature) : audit contrat OK
  (`modelesEmail.{list,create,update,delete}` présents). Clean-archi : `domain/modeles-email.ts` (types
  dérivés + `typeBadgeColor`/`filterByType`/**`renderPreview`** (substitution `{{var}}` pure) + consts
  EMAIL_TYPES/VARIABLES, **5 tests**) + `application/use-modeles-email.ts` (list + CRUD) + `ui/` (table +
  dialog création/édition + dialog aperçu + carte variables, markup à l'identique). i18n namespace
  `modelesEmail`. Route `/v2/modeles-email` + V2_ROUTES + sweep. **0 `any`**. tsc/eslint(0)/vitest **260**.

- **Migration `modeles-email-transactionnels` ✅** (5e des ~24 pages feature) : sibling de `modeles-email`
  (même endpoints `modelesEmail.*`, UI distincte avec modèles prédéfinis). **Correctif de parité** : le
  `<select>` legacy envoyait des valeurs HORS enum ("relance"/"confirmation"/"rappel") → 400 backend ;
  v2 mappe les libellés sur des valeurs VALIDES (`relance_devis`/`envoi_facture`/`rappel_paiement`/`autre`).
  Champ `variables` legacy supprimé (absent du schéma new-stack). Clean-archi : domain (TYPE_OPTIONS/varCode/
  MODELES_PAR_DEFAUT/defautToCreateInput, **5 tests**) + application (CRUD) + ui (réutilise `BulletproofModal`
  partagé, markup à l'identique). i18n namespace `modelesTransactionnels`. Route + V2_ROUTES + sweep. **0 `any`**
  (2 `as any` legacy supprimés). tsc/eslint(0)/vitest **265**.
- **ETA script `/tmp/eta.sh` rendu AUTO-AUDIT** : dérive `REMAINING` de l'état réel (dossiers
  `modern/features/<x>` manquants + forfaits auth/légal 3 + suppression 6) → ne peut plus surestimer.

- **Migration `assistant-conversations` (historique MonAssistant) ✅** (6e des ~24 pages feature) : audit
  contrat OK (`assistant.getThreads` présent). Clean-archi : `domain` (`AiThread` dérivé + `relativeTime`
  STRUCTURÉ i18n-friendly `{kind:instant|min|h|j|date}`, **5 tests**) + `application/use-assistant-threads.ts`
  + `ui` (liste de fils, navigation pleine page vers `/assistant` legacy → la bascule la redirigera une fois
  `/assistant` migré). i18n namespace `assistantConversations`. Route `/v2/assistant/conversations` +
  V2_ROUTES + sweep. **0 `any`** (le cast `as AiThread[]` legacy supprimé). tsc/eslint(0)/vitest **270**.

- **Migration `vehicules` (gestion de flotte) ✅** (7e des ~24 pages feature) : audit contrat — 7 endpoints
  `vehicules.*` + `techniciens.getAll` présents. **Gaps de DTO comblés SANS backend** (masqués par `any`
  legacy) : `getStatistiquesFlotte` renvoie `nbVehicules`/`kmTotalFlotte`/`assurancesAExpirer` (≠ noms legacy)
  → champs remappés + « entretiens à venir » = `entretiensAVenir.length` ; assurances/entretiens ne portent
  que `vehiculeId` (pas d'objet véhicule imbriqué) → **jointure client** `vehiculeImmat`. Clean-archi : domain
  (`statutClass`/`statutVariant`/`technicienPrenom`/`vehiculeImmat` + `TypeCarburant` non-null, **4 tests**) +
  application (5 queries + create/delete) + ui (stats + alertes + 3 onglets + dialog création, markup à
  l'identique, **3 `any` legacy supprimés** ; sentinel `"none"` pour le select technicien — Radix interdit
  `value=""`). i18n namespace `vehicules`. Route + V2_ROUTES + sweep. **0 `any`**. tsc/eslint(0)/vitest **274**.

- **Migration `rapport-commande` (articles en rupture à commander) ✅** (8e des ~24 pages feature) : audit
  contrat OK (`stocks.getRapportCommande` + `artisan.getProfile`). Clean-archi : `domain` (types dérivés +
  `formatCurrency`/`totalArticles`/`totalMontant`, **3 tests**) + `application/use-rapport-commande.ts` +
  `ui/rapport-commande-page.tsx` (résumé + liste par fournisseur + tableau) + **`ui/pdf-export.ts`** (export
  PDF bon de commande + rapport global). **jsPDF typé proprement** : forme FONCTION `autoTable(doc, opts)`
  (au lieu de `(doc as any).autoTable`) + accesseur typé `lastFinalY` → **0 `any`** (les `as any` legacy
  jspdf-autotable supprimés). i18n namespace `rapportCommande`. Route + V2_ROUTES + sweep. tsc/eslint(0)/vitest **277**.

- **Migration `rapports` (rapports personnalisables) ✅** (9e des ~24 pages feature) : audit contrat — 5
  endpoints `rapports.*` présents. **Gap backend détecté** : `executer` new-stack renvoie `{ resultats,
  nombreLignes, tempsExecution }` (pas `{colonnes, lignes, totaux}` comme le legacy) → **colonnes dérivées
  côté client** (`deriveColonnes`), **totaux retirés** (calcul backend legacy non porté → FINDING à combler).
  Clean-archi : domain (`humanizeColumn`/`favoris`/`formatCell`/`deriveColonnes` + types, **5 tests**) +
  application (list + executer via skipToken + CRUD/favori) + ui (3 onglets : mes-rapports/exécuter/modèles
  + dialog création + export CSV). i18n namespace `rapports`. Route + V2_ROUTES + sweep. **0 `any`**.
  tsc/eslint(0)/vitest **282**. **FINDING** : enrichir backend `executer` (colonnes explicites + totaux agrégés).

- **Migration `documentation` (guide d'utilisation) ✅** (10e des ~24 pages feature) : page STATIQUE (0
  endpoint). Le **catalogue de contenu** (10 sections × sous-sections) vit en `domain/documentation-content.ts`
  (data, pas du libellé d'interface → reste en domain ; `iconKey` string au lieu d'un composant React pour
  garder le domain pur) + `normalize`/`filterSections` (recherche tolérante, **5 tests**). `ui` : sommaire +
  recherche + accordéons + `RenderLine` (tip/bullet/texte) + export PDF (`@/lib/generateGuidePDF` partagé) ;
  chrome i18n (`documentation`). **0 `any`**. Petite dette legacy nettoyée : `gray` inutilisé retiré de
  `@/lib/generateGuidePDF.ts` (bloquait le typecheck v2 via l'import ; 0 nouvelle erreur build). Route +
  V2_ROUTES + sweep. tsc/eslint(0)/vitest **287**.

- **Migration `ma-vitrine` (page publique + avis) ✅** (11e des ~24 pages feature) : audit contrat — 9
  endpoints présents MAIS **gap découvert** : les champs `vitrine*` ne sont PAS dans `parametres.get`
  (legacy) → ils vivent dans le module **`vitrine`** (`vitrine.getSettings`/`updateSettings`, OPE-504) →
  hook recâblé sur `vitrine.*`. Clean-archi : domain (`parseServices`/`buildVitrineUrl`/`avisStatutClass`/
  `formatDate`, **4 tests**) + application (vitrine settings + artisan profil/slug + avis getAll/repondre/
  moderer/envoyerDemande + clients) + ui (lien public + perso + liste d'avis + 2 dialogs). i18n namespace
  `maVitrine`. Route + V2_ROUTES + sweep. **0 `any`**. tsc/eslint(0)/vitest **291**.

- **Migration `rdv-en-ligne` (demandes de RDV) ✅** (12e des ~24 pages feature) : audit contrat — le module
  `rdv-en-ligne` est **monté sous la clé `rdv`** (appRouter ligne 156) → `trpc.rdv.{list,getStats,confirm,
  refuse,proposeAutreCreneau}` présents. **Gap** : `rdv.list` new-stack ne prend **pas de filtre statut**
  (renvoie tout) → **filtre client-side** (`filterByStatut`). Clean-archi : domain (`statutClass`/`urgenceClass`/
  `clientName`/`filterByStatut`, **5 tests**) + application (list + stats + 3 transitions avec invalidations) +
  ui (header/stats + filtres + liste + 2 dialogs refus/autre-créneau). i18n namespace `rdvEnLigne`. **0 `any`**
  (selectedRdv/rdv any legacy supprimés). Route + V2_ROUTES + sweep. tsc/eslint(0)/vitest **296**.

- **Migration `alertes-previsions` (alertes écarts de CA) ✅** (13e des ~24 pages feature) : audit contrat —
  module `alertes-previsions` keyé `alertesPrevisions`, 4 endpoints (getConfig/getHistorique/saveConfig/
  verifierEtEnvoyer) présents. **Gaps de DTO comblés** (masqués par `any` legacy) : l'historique a `dateEnvoi`
  (≠`createdAt`), `caRealise` (≠`caReel`), et un **canal unique** `canalEnvoi` (`email`/`sms`/`les_deux`) au
  lieu des 2 booléens legacy → helpers purs `canalHasEmail`/`canalHasSms`. Clean-archi : domain
  (`isAlertePositive`/`formatMontant`/`formatDateHeure`/`canalHas*`, **5 tests**) + application (config +
  historique + save + verifier) + ui (formulaire seuils/canaux/fréquence + historique). i18n namespace
  `alertesPrevisions`. **0 `any`** (2 legacy supprimés). Route + V2_ROUTES + sweep. tsc/eslint(0)/vitest **301**.

## 🎯 PROCHAINE CIBLE : **migrer la page feature suivante** (cf. `/tmp/eta.sh`). Sans carte/charts :
`nouvelle-depense`, `tableau-bord-sync-comptable`, `devis-ia`, `import`, `performances-fournisseurs`…
(+ `assistant/conversations`), puis `chantiers`/`planification`/`rapports`/`previsions`/`vehicules`/`badges`/
`geolocalisation`/`devis-ia`/`analyses-photos`/`classement`/`ma-vitrine`/`rdv-en-ligne`/`modeles-email`/…
Process : audit contrat (combler gap backend si besoin) → clean-archi domain/application/ui → i18n → route +
V2_ROUTES + sweep → gates → deploy. **Ensuite** : suppression legacy (cf. méthode éprouvée) + wouter + `@/lib/trpc`.

### Plan Portail (slices) — audit contrat GREEN (14 endpoints clientPortal OK) :
Page la + grosse/risquée (1211 l., PUBLIC par token, **paiement Stripe**). **Audit contrat ✅** : les **14 endpoints `clientPortal.*` existent tous** en new-stack (verifyAccess, getClientInfo, getDevis, getFactures, getInterventions, getSuiviChantiers, getCreneauxDisponibles, getMesRdv, getConversations, getConversationMessages, demanderRdv, demanderModification, sendClientMessage, soumettreDemandeIA). **Montage** : route PUBLIQUE additive dans `public-router.tsx` (`/portail/$token`, comme signature) + `App.tsx` `<Route path="/v2/portail/:token" component={PublicModernRouterMount} />`. **Non lié au trafic réel** (les liens emailés pointent vers le legacy `/portail/:token` jusqu'au cutover backend des liens) → **constructible en slices sans risque**. **Paiement = REST** `fetch('/api/paiement/create-checkout-session', {factureId, token})` → redirect Stripe (⚠️ cf. CLAUDE.md : `x-forwarded-host`/`success_url`, retour `?paiement=succes|annule`). **5 `any` legacy** à supprimer.
**Slices (1 itération chacune) :**
1. **Socle** : route publique + `feature portail` (`application/use-portail-access` = `verifyAccess` ; domain types dérivés) + `ui` = états chargement / **lien invalide-expiré** / coquille (header client + `Tabs` scaffold). Sweep : test « montage déclenche `verifyAccess` » (token bidon, pattern signature).
2. **Onglet Devis** (`getDevis`) + **Factures** (`getFactures` + **paiement Stripe** REST — tester le flux de bout en bout, success_url).
3. **Onglet Interventions** (`getInterventions`) + **Suivi chantiers** (`getSuiviChantiers` + Progress).
4. **Onglet RDV** (`getCreneauxDisponibles` + `getMesRdv` + `demanderRdv`).
5. **Onglet Chat** (`getConversations` + `getConversationMessages` + `sendClientMessage`).
6. **Onglet Demande IA** (`soumettreDemandeIA` + structured result) + `demanderModification`.
Chaque slice : gabarit clean-archi (domain/application/ui, 0 any, i18n, tests), gate, deploy, sweep ciblé. **Parité testable** : via token de test (montage + appels tRPC), pas par marqueurs auth.

## (archive) Home (`/`, marketing 1624 l., 0 endpoint/0 any, static) — i18n massif, basse priorité.
Le backend expose maintenant `depenses[]`/`nbDepenses`/cascade. À faire (gabarit clean-archi habituel) :
- **domain** : types dérivés `RouterOutputs["depenses"]["getNoteFraisById"]` (= note + `depenses[]`) / `listNotesFrais` (= note + `nbDepenses`) — **plus aucun `any`** (le legacy avait `d:any`/`n:any` masquant le gap, désormais comblé). Helpers purs (eur, fmtDate, statut timeline).
- **application** : les 10 endpoints `depenses.*NoteFrais*` (listNotesFrais, getNoteFraisById, create/soumettre/approuver/rejeter/payer, add/removeDepense, depenses.list brouillon).
- **ui** : liste (cartes avec `nbDepenses`/montant) + détail (timeline workflow + **dépenses incluses** + add/remove + actions soumettre/approuver/rejeter/payer). Câblage route `/notes-frais` + V2_ROUTES + i18n + sweep `ROUTE`.
NB : chemin legacy = vérifier dans App.tsx (`/notes-de-frais` ? `/notes-frais` ?) avant câblage.

### Autres gros chantiers restants (Portail client Stripe · Home).
Gap : `getNoteFraisById` sans `depenses[]`, `listNotesFrais` sans `nbDepenses`, `createNoteFrais` ignore `depenseIds`. **Domaine FINANCIER sensible** (anti-IDOR, RLS, montants exacts) → implémenter avec soin, additif. **Le pattern de join existe déjà** dans `note-de-frais-repository-drizzle.ts` (`addDepenseLink` fait `depenses ⋈ notesFraisDepenses` scopé `artisan_id` + `remboursable`). Colonnes `depenses` confirmées : `id, numero, date_depense, fournisseur, categorie, montant_ttc`.
**Backend (itération intermédiaire) :**
1. **Types** (`domain/note-de-frais.ts`) : `NoteFraisDepense = { id, numero, fournisseur, dateDepense, categorie, montantTtc }` ; `NoteDeFraisDetail = NoteDeFrais & { depenses: NoteFraisDepense[] }` ; `NoteDeFraisListItem = NoteDeFrais & { nbDepenses: number }`.
2. **Repo interface** : `getDepensesForNote(ctx, noteId): Promise<NoteFraisDepense[]>` + faire renvoyer `list()` des `NoteDeFraisListItem[]` (nbDepenses via COUNT du lien). Drizzle : copier le join existant (select des champs depense ; pour la liste, sous-requête COUNT `notes_frais_depenses` group by note). **Fake** : tracker les liens (ajouter une Map noteId→depenseIds + un store de dépenses injecté pour les tests) ; sinon renvoyer counts/[].
3. **Read use-case** `getNoteFraisDetail(repo, ctx, id)` = compose `getById` + `getDepensesForNote` (⚠️ parité : `getNoteFraisById` du routeur renvoie **null** si introuvable, PAS 404 → renvoyer `null` ou `{...note, depenses}`).
4. **Create cascade** : dans le routeur `createNoteFrais` (ou un use-case), après `creerNoteDeFrais`, **boucler `addDepenseLink(noteId, depenseId)` sur `input.depenseIds`** (anti-IDOR déjà porté par addDepenseLink : skip si pas du tenant/non remboursable). Le `montant_total` se recalcule déjà dans addDepenseLink.
5. **Router** : `getNoteFraisById` → `getNoteFraisDetail` ; `listNotesFrais` → liste enrichie ; `createNoteFrais` → cascade.
6. **Tests** vitest (fake + use-cases) ; **deploy new-stack** + smoke authentifié.
**Puis (front, itération suivante)** : RE-migrer `pages/NotesFrais.tsx` → `/v2/notes-frais` (la migration était REPORTÉE faute de ce backend) : domain (types dérivés `RouterOutputs`, plus de `any`), application (les 10 endpoints `depenses.*NoteFrais*`), ui (détail avec dépenses + add/remove), câblage + sweep `ROUTE`.

### Autres gros chantiers restants (Portail client Stripe · Home).
### (archive) anciennes cibles
Les endpoints `vitrine.getSettings`/`updateSettings` sont **déployés** (new-stack). À faire :
1. `application/use-parametres.ts` : ajouter `vitrine.getSettings` (query) + `vitrine.updateSettings` (mutation, invalidation).
2. `domain/parametres.ts` : type `VitrineSettings` dérivé `RouterOutputs["vitrine"]["getSettings"]` + champs vitrine dans `ParametresForm` + mappers `vitrineToForm`/`formToVitrineInput` (⚠️ `vitrineServices` = textarea lignes ↔ JSON array — porter le `JSON.parse`/`join("\n")` legacy). Tests.
3. `ui/parametres-page.tsx` : re-rendre la carte « Ma page vitrine » (activation + slug déjà géré via artisan + description/zone/services/expérience + lien `/vitrine/:slug`), bouton save dédié OU intégré au submit général (2 mutations).
4. Sweep `ROUTE=/v2/parametres` (ajouter marqueur « Ma page vitrine »).
Puis les autres gros chantiers :

### Gros chantiers restants (par priorité) :

Longue traîne 30/30 migrée. Ordre à la reprise :
1. **(si débloqué) Réintégrer la section vitrine dans `/v2/parametres`** dès qu'OPE-504 livre `vitrine.getSettings`/`updateSettings` (vérifier `src/modules/vitrine/interface/trpc/` ; décision humaine 2026-06-17). Détail = entrée `parametres` « À FAIRE À LA REPRISE ».
2. **`Dashboard`** (`/dashboard`, 711 l.) — **PLAN BUILD-READY** (aucun blocker trouvé : 5 endpoints existent, widgets réutilisables, dé-batch déjà fait via `splitLink` `DASHBOARD_UNBATCHED` dans `main.tsx`) :
   - **Stratégie = THIN-SHELL + réutilisation des widgets** (comme `@/components/Calendar`). Les ~17 widgets `@/components/dashboard/**` sont **zéro-prop auto-suffisants** (chacun fetch sa donnée via `@/lib/trpc`) → **réutilisés tels quels** (clean-archi widget-par-widget = slices FUTURS). Ne PAS les réécrire maintenant.
   - **domain/dashboard.ts** (PUR, testable) : `resolveWidgetOrder(savedRaw, allIds)` (port de `loadOrder` : garde ids valides + append nouveaux), `parseHidden(raw)` (port `loadHidden`), `formatEUR`, dérivation `DashboardState` (nouveau/demarrage/confirme) depuis stats, mapping des StatCards depuis `getStats`. Clés localStorage `operioz.dashboard.widgetOrder`/`hiddenWidgets`. **Types** `RouterOutputs["dashboard"]["getStats"/"getAlerts"/"getConversionRate"/"getObjectifs"]`.
   - **application/use-dashboard.ts** (SEULE couche tRPC) : `dashboard.getStats` (staleTime 30s, refetchOnWindowFocus:false) + `getConversionRate` (60s) + `getAlerts` (60s) + `getObjectifs` + `artisan.getProfile`. **Le current user via `auth.me`** (PAS `useAuth` legacy).
   - **ui/dashboard-page.tsx** : compose `WelcomeBanner` + `AlertsBar` + StatCards (`StatCard`) + `QuickActions` + `ConseillerIAWidget` + grille de widgets réordonnables/masquables (réutilise `DashboardWidget` + `CustomizePanel` + tous les `widgets/*`). localStorage read/write pour order+hidden (les 4 helpers : logique PURE en domain, accès `window.localStorage` en ui). **5 `any` legacy à supprimer**.
   - Câblage route `/dashboard` + V2_ROUTES + i18n + sweep e2e (marqueurs « Tableau de bord »/welcome ; **non admin-gated**). Vérifier au navigateur (page lourde → chunk-race possible, re-run sweep).
3. **Puis** Portail client (`/portail/:token`, 1211 l., **Stripe PUBLIC** — le + risqué, cf. CLAUDE.md `x-forwarded-host`/`success_url`) · Home (`/`, 1624 l.).
4. **Dette** : portage propre d'`AbonnementSection` (Stripe/devices) vers `@/modern/shared/trpc`.
5. **Note cleanup (hors périmètre /modern)** : `pages/DashboardAdvanced.tsx` (498 l.) est **DEAD CODE** (aucune route dans App.tsx, aucun import) → ne PAS migrer ; à supprimer côté legacy (cleanup OPE-255).

### (archive) plan détaillé Parametres (FAIT — voir entrée ci-dessus) & gros chantiers différés
Au choix selon priorité :

`pages/Parametres.tsx` ~674 l. Tabs `general` + `abonnement`. **Plan de slice (1 itération dédiée) :**
1. **Réutiliser `@/components/AbonnementSection`** pour l'onglet abonnement (composant Stripe/devices
   auto-suffisant via `@/lib/trpc` legacy — même stratégie que `@/components/Calendar` ; portage propre
   d'AbonnementSection = slice futur séparé, gros : checkout/portal/devices = 8 endpoints).
2. **Onglet `general`** = feature clean-archi `parametres` :
   - `domain/` : `parametresToForm(parametres, artisan)` + `formToUpdateInput(formData)` (mappers PURS,
     incl. `parseVitrineServices` JSON) + `buildIcalUrl(path, origin)` + `demandeStatutClass` ; **types**
     `RouterOutputs["parametres"/"artisan"/"vitrine"/"calendrier"]`. Tests sur les 2 mappers.
   - `application/` : `parametres.get` + `artisan.getProfile` + `calendrier.getIcalFeed` +
     `vitrine.getDemandesContact` + mutations `parametres.update`/`artisan.updateProfile`/`regenerateIcalFeed`/
     `updateDemandeContactStatut`/`convertirDemandeEnClient`. Logo = `fetch('/api/upload-logo')` (REST, garder en ui).
   - `ui/` : sections numérotation, mentions/CGV, paiement, notifications, personnalisation (logo+couleurs),
     slug, iCal, demandes contact (leads). **Deep-link `?tab=abonnement`** + toasts `?success=1`/`?canceled=1`.
   - **⚠️ BLOQUÉ (finding OPE-504)** : la **section « Ma page vitrine » (réglages** `vitrineActive`/`Description`/
     `Zone`/`Services`/`Experience`**)** n'a **AUCUN endpoint d'écriture/lecture** en new-stack
     (`parametres.get/update` les excluent, pas de `vitrine.updateSettings`, `artisan.updateProfile` ne les
     porte pas). Sur new-stack elle est **déjà non fonctionnelle** (champs vides + non sauvegardés). **Décision
     à confirmer (humain)** : OMETTRE cette sous-section dans `/v2` (recommandé : pas de backend → pas de UI
     morte) **ou** la répliquer telle quelle (non fonctionnelle). Démarrer la migration **sans** cette
     sous-section et la rajouter quand OPE-504 livre le endpoint. Le reste de la page est 100% migrable.
3. **Câblage** route + `V2_ROUTES` `/parametres` + i18n + sweep e2e (`?tab=` deep-link + marqueurs « Paramètres »,
   « Numérotation des documents »). NB : page **non admin-gated** → marker-testable au sweep.

### (archive) pages déjà traitées / différées hors Vague R
- **Dashboard** (`/dashboard`, ~711 l., ~16 widgets) — stratégie : feature `dashboard` (domain agrégats +
  application hooks par widget). Le plus gros chantier restant. **⚠️ DEMANDE HUMAINE (2026-06-17) : DÉ-BATCHER
  les requêtes** — actuellement trop lent à afficher les différents blocs (le batch tRPC fait attendre TOUS
  les blocs sur la requête la plus lente). → côté `application/`, faire des hooks/queries **séparés par
  widget** (pas un seul gros lot) pour que chaque bloc s'affiche dès que SA donnée arrive (streaming visuel).
  Vérifier l'option httpBatchLink / utiliser des queries indépendantes non batchées (ou `httpLink` ciblé).
- **Portail client** (`/portail/:token`, PUBLIC, ~1211 l., paiement Stripe) — bien tester le flux Stripe
  (cf. CLAUDE.md : `x-forwarded-host`, success_url).
- **Home** (`/`, ~1624 l.) · **Abonnement** · **DashboardAdvanced** (~498 l.).
- **LONGUE TRAÎNE** (stratégie de progression régulière, faible risque) : il reste de NOMBREUSES petites
  pages legacy non migrées (cf. `ls client/src/pages` : DevisOptions, ReglesDepenses, NotesFrais, Support,
  Avis, Flotte, Calendrier, Contrats, Conges, RelancesDevis, Utilisateurs, Parametres, etc.). Migrer une
  petite page complète/itération est un bon rythme entre deux gros chantiers. Déjà faits hors Vague R :
  `portail-gestion`, `budgets-depenses`, `regles-depenses`, `historique-emails`, `support`, `avis`,
  `flotte`, `statistiques-devis`, `modules`, `conges`, `contrats`, `relances-devis`, `calendrier`,
  `utilisateurs`, `devis-options`. **Restante** : **Parametres** (gros, multi-domaine : profil artisan +
  parametres + iCal + demandes vitrine + `AbonnementSection` Stripe/devices). Dernier gros chantier —
  à SLICER (4 sous-domaines + section abonnement) plutôt qu'en une itération.
  (NotesFrais **reportée** : gap backend OPE-490 — détail sans `depenses[]`/`nbDepenses`.)
Appliquer le **même gabarit clean-archi + audit §3bis** (`no-trpc-in-ui` = error dès le départ). Pour une
nouvelle page (pas un rétrofit) : créer la feature complète + **câbler la route** (router.tsx + `addChildren`),
**`V2_ROUTES`**, **i18n** (namespace + agrégation `shared/i18n/index.ts`, pas de chaîne en dur) + **ajouter
au sweep e2e** `PARITE_PAGES`.

### Vague R — rétrofit clean-archi (après le pattern de référence)
Rétrofitter 1 feature/itération (extraction `application/use-<feature>` + `domain` typés, `ui` sans tRPC,
0 `any`) : notifications · techniciens · fournisseurs · articles · devis · factures · interventions ·
commandes · stocks · depenses · comptabilite · signature · paiement. Puis **eslint trpc-interdit-dans-ui = error**.

## (reporté) Vague 3 — Portail client `/v2/portail/:token` (PUBLIC, par token, paiement Stripe).
`PortailClient` ~1211 l. (la plus grosse) → **découper en slices**. Socle public prêt. Primitives `progress`
à ajouter au barrel. *(OPE-423)*
*(Dashboard reporté : ~16 widgets legacy `@/components/dashboard/**` → stratégie widgets à définir.)*

### Dette e2e
- **Signature — flow signé complet** : l'e2e actuel vérifie seulement le MONTAGE (requête tRPC déclenchée) ;
  le flux signer/refuser/sélectionner option nécessite un **token valide** (générer un devis + lien signature)
  → à ajouter dans une itération e2e dédiée. *(react-query retry sur token invalide → l'état d'erreur met
  >1.5 s à s'afficher, d'où le check par requête plutôt que par texte.)*

### Vague 2 — listes + mutations *(OPE-422)* — ✅ TERMINÉE (6/6)
- [x] **Devis → `/v2/devis`** — port conforme `pages/Devis.tsx` (`devis-page.tsx`), i18n (namespace `devis`, statuts + exports PDF/Excel), `StatutBadge` ré-exporté dans `modern/shared/ui`. Mutations delete + convertToFacture (pas de `update({statut})`). 4 gates verts, parité e2e `17|0`, déployé.
- [x] **Factures → `/v2/factures`** — port conforme `pages/Factures.tsx` (`factures-page.tsx`), i18n (namespace `factures`), `StatutBadge` partagé, dialog création + alerte encours client + cartes stats + filtres type/statut + export CSV. Mutations create + delete. 4 gates verts, parité e2e `19|0`, déployé.
- [x] **Interventions → `/v2/interventions`** — port conforme `pages/Interventions.tsx` (`interventions-page.tsx`), i18n (namespace `interventions`), `StatutBadge` partagé, dialogs création/édition + **gestion d'équipe** (ajout/retrait membres) + filtres + durée réelle. Mutations create/update/delete + équipe. 4 gates verts, parité e2e `21|0`, déployé.
- [x] **Commandes → `/v2/commandes`** — port conforme `pages/CommandesFournisseurs.tsx` (`commandes-page.tsx`), i18n (namespace `commandes`), filtres statut/fournisseur + table + actions (PDF/email/suppression). Mutations delete + sendEmail. 4 gates verts, parité e2e `25|0`, déployé.
- [x] **Stocks → `/v2/stocks`** — port conforme `pages/Stocks.tsx` (`stocks-page.tsx`, ~812 l.), i18n (namespace `stocks`), Tabs (tous/bas) + KPIs + alertes + 4 dialogs (créer/éditer/mouvement/historique). Mutations create/update/delete/adjustQuantity/generateAlerts. Double-DashboardLayout legacy supprimé. Fix tsc : `quantite` envoyé en `String`. 4 gates verts, parité e2e `27|0`, déployé.
- [x] **Dépenses → `/v2/depenses`** — port conforme `pages/Depenses.tsx` (`depenses-page.tsx`), i18n (namespace `depenses`), KPIs + filtres + liste + dialog indemnités km. Mutations delete/exportFecAchats/creerIndemniteKm. **Finding** : `depenses.list` sans `.input()` → filtres ignorés côté serveur (legacy aussi) → appel `useQuery()` sans args. 4 gates verts, parité e2e `29|0`, déployé.
- **Sidebar → v2** câblée (`DashboardLayout` via `resolveV2Path`) : tous les liens de routes migrées pointent sur `/v2`.

### Cibles suivantes (file)
1. Vague 1 — Articles, Fournisseurs, Techniciens (i18n + kebab d'emblée ; chacune ~600-700 l. → prévoir slices + primitives dialog/table/textarea).
2. Dette batchée : e2e mutation (modal édition Clients).
3. Enrichir le gate ESLint v2 au fil des specs (ex. interdire `@/components/*` hors UI, imports relatifs profonds, etc.).

> Note coordination boucle : pilotée par **CronCreate natif Claude** (job `834543d1`, toutes les 2 min, session-only → vit tant que le screen `ope-403-refonte-frontend` tourne). Le daemon bash `devtools/refonte-loop/*` est **désactivé** (ne pas le relancer).

---

## Log d'itérations
<!-- broadcast.sh append ici ; ajouter aussi un résumé manuel par itération si utile -->
- `init` boucle créée (journal + prompt + gate tsconfig.v2 + cron 2 min). Prochaine cible : S1.
- **Migration — `devis-options` ✅ (placeholder statique)** : port conforme de `pages/DevisOptions.tsx` (page explicative renvoyant vers la gestion des variantes depuis le détail d'un devis). **Présentation pure SANS données** (aucun tRPC) → pas de couche domain/application (justifié : page statique) ; `ui/devis-options-page.tsx` (i18n complet, emphase inline via `<Trans>` pour parité stricte ; navigation wouter `Link` vers `/devis` — pattern modern). Câblage route + V2_ROUTES + i18n + sweep e2e (`PARITE_PAGES`, page non gated → marqueurs OK). Gates : tsc/eslint 0 err, vitest **183** (pas de nouveau test — page sans logique). **Audit §3bis : N/A domain/app (page statique) ; 3 critères pertinents OK** (ui sans tRPC · i18n · parité visuelle stricte via Trans).
- **Migration clean-archi — `utilisateurs` ✅ (longue traîne, gestion équipe + permissions, admin-only)** : nouvelle feature migrée de `pages/Utilisateurs.tsx` (invite collaborateur + rôles + toggle actif + matrice permissions + dialog permissions perso). `domain/utilisateur.ts` (types `RouterOutputs`/`Inputs` + `@shared/permissions` ; fonctions PURES `buildMatrixRows`/`roleDefaults`/`togglePermission`/`isCustomized`/`hasAnyCustomization`/`fullName` ; **7 tests**) + `application/use-utilisateurs.ts` (SEULE couche tRPC : list + **`auth.me`** pour le garde admin/« c'est moi » + invite/updateRole/toggleActif ; `useUtilisateurPermissions` pour le dialog : getPermissions+update+reset) + `ui/utilisateurs-page.tsx` (présentation pure, **0 `any`** — supprime les **12 `any`** legacy ; garde admin via `currentUser.role` (new-stack `auth.me`, PAS le `useAuth` legacy qui dépend de `@/lib/trpc`) → non-admin redirigé vers `/dashboard` legacy). Câblage route + V2_ROUTES + i18n + **maj `v2-routes.test.ts`** (exemple non-migré → `/parametres`). **⚠️ Page admin-only : l'utilisateur e2e `dev@operioz.com` est `artisan` (non admin)** → le sweep de parité par marqueurs ne peut PAS la couvrir (legacy ET v2 redirigent vers `/dashboard`). **Pas d'entrée `PARITE_PAGES`** ; parité vérifiée autrement = (1) gates verts, (2) redirection identique non-admin→`/dashboard` confirmée au navigateur. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **183**.
- **Migration clean-archi — `calendrier` ✅ (longue traîne, vue calendrier interventions)** : nouvelle feature migrée de `pages/Calendrier.tsx` (calendrier glisser-déposer des interventions + dialog de planification). `domain/calendrier.ts` (RÉUTILISE le domaine `interventions` — types + `groupEquipeByIntervention`/`buildAdresse` ; ajoute `toCalendarItems` (projection vers la forme du composant `Calendar`, **résout le client via clientId** car `interventions.list` ne joint pas le client, pattern contrats/flotte), `defaultHeureFin`/`heureDeDate`/`combineDateTime` ; **7 tests**) + `application/use-calendrier.ts` (SEULE couche tRPC : interventions.list + clients.list + getEquipesByArtisan ; mutations create/update planifier+déplacer) + `ui/calendrier-page.tsx` (présentation pure, **0 `any`** — supprime les 4 `any` legacy ; **réutilise `@/components/Calendar`** (composant présentationnel pur, sans tRPC — même catégorie que `@/components/ui/*`) ; clic intervention → `/v2/interventions?id=`). Câblage complet (route + V2_ROUTES `/calendrier` + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **176**.
- **Migration clean-archi — `relances-devis` ✅ (longue traîne, workflow relances)** : nouvelle feature migrée de `pages/RelancesDevis.tsx` (devis non signés à relancer : relance individuelle + relances auto en lot + dialog de config). `domain/relance-devis.ts` (type dérivé `RouterOutputs["devis"]["getDevisNonSignes"][number]` — remplace l'`interface DevisNonSigne` recopiée à la main du legacy ; fonctions PURES `formatCurrency`, `partitionByEmail`, `defaultRelanceMessage`, `toggleJourEnvoi` + const `JOURS_SEMAINE` ; **7 tests**) + `application/use-relances-devis.ts` (SEULE couche tRPC : getDevisNonSignes + envoyerRelance + envoyerRelancesAutomatiques, invalidation) + `ui/relances-devis-page.tsx` (présentation pure, **0 `any`** déjà, i18n complet ; lien devis détail = `<a href>` legacy car `/devis/:id` non migré ; dialog config = UI locale non persistée, parité). Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **169**. ⚠️ **Piège câblage corrigé** : le chemin LEGACY est `/relances` (PAS `/relances-devis`) — la clé `V2_ROUTES` et l'entrée sweep doivent utiliser le **vrai chemin legacy** (`/relances`) sinon la parité 404 côté legacy. Parité e2e finale `61 cas / 0 issues`.
- **Perf e2e — `scripts/pw-run.sh` ne réinstalle plus Playwright à chaque run** : `/pw` vivait dans le conteneur `--rm` (éphémère) → réinstall npm (~90 s) à CHAQUE sweep. Fix : volume Docker **nommé persistant** (`operioz-pw-<version>`) monté sur `/pw` → install une seule fois (cache froid), réutilisé ensuite. Run mesuré : **1m46s → 11s** (cache chaud). Le volume est versionné sur le tag de l'image (réinstall propre si on bump Playwright).
- **Migration clean-archi — `contrats` ✅ (longue traîne, CRUD + facturation récurrente)** : nouvelle feature migrée de `pages/Contrats.tsx` (contrats de maintenance : CRUD + génération de facture + stats CA récurrent). `domain/contrat.ts` (types `RouterOutputs`, fonctions PURES `clientNom` (résolution front), `computeStats` (CA annualisé via `PERIODICITE_MULT`), `filterContrats` (statut + recherche accent-insensible `matchSearch`), `statutVariant` + consts ; **8 tests**) + `application/use-contrats.ts` (SEULE couche tRPC : list + clients ; mutations create/update/delete/generateFacture avec invalidation) + `ui/contrats-page.tsx` (présentation pure, **0 `any`** — supprime les 3 `any` legacy via types dérivés + `handleEdit(contrat: Contrat)`). **Finding (géré côté front, non bloquant)** : `contrats.list` new-stack renvoie le contrat **sans jointure `client`** (juste `clientId`) → le nom client est résolu depuis la liste `clients` déjà chargée (même pattern que flotte/OPE-486). Détail contrat non migré → row click = navigation pleine page vers la route legacy `/contrats/:id`. Câblage complet (route + V2_ROUTES + i18n + sweep e2e) + **maj `v2-routes.test.ts`** (`/contrats` désormais migré → exemple non-migré = `/utilisateurs`). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **162**.
- **Migration clean-archi — `conges` ✅ (longue traîne, workflow RH)** : nouvelle feature migrée de `pages/Conges.tsx` (gestion des demandes de congés : create + workflow approuver/refuser + onglets tous/approuvés/refusés). `domain/conge.ts` (types `RouterOutputs/Inputs`, fonctions PURES `calculerJours` (inclusif, garde NaN→0), `technicienNom` (null si introuvable), `filterByStatut` + consts `TYPES_CONGE`/`STATUTS` ; **7 tests**) + `application/use-conges.ts` (SEULE couche tRPC : list + enAttente + techniciens, mutations create/approuver/refuser avec invalidation des deux listes) + `ui/conges-page.tsx` (présentation pure, **0 `any`** — supprime le `type as any` du legacy via `TypeConge` dérivé du routeur ; couleurs statut en const, libellés type/statut en i18n). **Finding repéré (non bloquant)** : `conges.list` du new-stack n'a PAS d'`.input()` → l'appel legacy `useQuery({})` ne typecheckait QUE contre le routeur legacy ; en v2 on appelle `useQuery()` sans argument (parité comportementale). Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **154**.
- **Finding (backend, hors périmètre front) — Notes de frais** : `getNoteFraisById`/`listNotesFrais` du new-stack renvoient `NoteDeFrais` (domaine) qui **n'expose ni `depenses[]` ni `nbDepenses`** → la page legacy `NotesFrais.tsx` lit `detail.depenses`/`n.nbDepenses` via `any` (masqué) : en new-stack la liste des dépenses incluses est **toujours vide** et le compteur **toujours 0**. `createNoteFrais` **ignore** aussi `depenseIds`. ⇒ migration `notes-frais` reportée tant que le slice backend (enrichir le détail + cascade dépenses↔note) n'est pas livré. **À promouvoir en issue Linear (projet findings).**
- **Migration clean-archi — `modules` ✅ (longue traîne)** : nouvelle feature migrée de `pages/Modules.tsx` (activation des modules/fonctionnalités ; legacy chaînes EN DUR + type local `ModuleRow` + cast → i18n namespace `modules` + type `RouterOutputs`). `domain/module.ts` (type `Module` + fonctions PURES `toCategorie`/`toPlan`/`filterByCategorie`/`popularModules`/`moduleCounts`/`progressPct`/`countByCategorie` + consts `CATEGORIES`/`PLANS`/`POPULAR_SLUGS` ; **6 tests**) + `application/use-modules.ts` (SEULE couche tRPC : list + toggle, invalidation list+getMine) + `ui/modules-page.tsx` (présentation pure framer-motion, **0 `any`** ; méta couleurs en const, libellés cat/plan en i18n). **Primitives `switch` + `tooltip` ajoutées au barrel `shared/ui`**. Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **147**.
- **Migration clean-archi — `statistiques-devis` ✅ (longue traîne, gros calcul extrait)** : nouvelle feature migrée de `pages/StatistiquesDevis.tsx` (analyse perf des devis, lecture seule ; legacy chaînes EN DUR + gros `useMemo` de stats inline → i18n namespace `statistiquesDevis` + **tout le calcul extrait dans `domain/statistiques.ts`**). `domain/statistiques.ts` (`computeDevisStats(list, periode, now?)` PUR : compteurs/montants par statut + taux de conversion + délai moyen de réponse + évolution vs période précédente, `now` injectable ; **5 tests** dont scénario multi-devis complet) + `application/use-statistiques.ts` (SEULE couche tRPC : `devis.list` lecture seule) + `ui/statistiques-devis-page.tsx` (présentation pure framer-motion, **0 `any`** ; le cast legacy `as DevisLike[]` supprimé). Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **141**.
- **Migration clean-archi — `flotte` ✅ (longue traîne + 1 finding)** : nouvelle feature migrée de `pages/Flotte.tsx` (vue d'ensemble du parc : stats + alertes entretiens/assurances + liste véhicules, lecture seule ; legacy chaînes EN DUR → i18n namespace `flotte`). `domain/flotte.ts` (types `RouterOutputs` (`FlotteStats`/`Vehicule`/`EntretienAVenir`/`AssuranceExpirant`) + fonctions PURES `daysUntil` (`now` injectable)/`entretiensEnRetard`/`assurances30j`/`indexByVehiculeId`/`indexVehiculesById` ; **5 tests**) + `application/use-flotte.ts` (SEULE couche tRPC : 4 queries lecture seule) + `ui/flotte-page.tsx` (**0 `any`**). **🔴 FINDING** : les DTO `getEntretiensAVenir`/`getAssurancesExpirant` n'exposent **pas** `marque`/`modele`/`immatriculation` ; le legacy les lisait via `any` → **libellés véhicule VIDES dans les alertes** (« () — entretien … en retard »). Corrigé : résolus via la liste des véhicules (`indexVehiculesById` + `vehiculeId`). Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **136**.
- **Migration clean-archi — `avis` ✅ (longue traîne)** : nouvelle feature migrée de `pages/Avis.tsx` (gestion des avis clients : stats note moyenne/distribution + liste + réponse + modération ; legacy chaînes EN DUR → i18n namespace `avis`). `domain/avis.ts` (types `RouterOutputs` (`Avis`/`AvisStats`) + fonctions PURES `avisStatutKind`/`distributionPercent`/`nextModerationStatut`/`canReply` ; **4 tests**) + `application/use-avis.ts` (SEULE couche tRPC : getAll+getStats, repondre/moderer) + `ui/avis-page.tsx` (**0 `any`** ; `distribution` typé par clés littérales 1..5 → tuple `NOTES as const`). Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **131**.
- **Migration clean-archi — `support` ✅ (longue traîne)** : nouvelle feature migrée de `pages/Support.tsx` (centre d'aide : canaux de contact + FAQ accordéon + formulaire de contact ; legacy chaînes EN DUR + FAQ inline → i18n namespace `support`, FAQ via `returnObjects`). `domain/support.ts` (`SUJETS` + `isContactValid` pur ; **2 tests**) + `application/use-support.ts` (SEULE couche tRPC : `support.contact`) + `ui/support-page.tsx` (**0 `any`**, toasts/reset via `onSuccess` par appel). **Primitive `accordion` ajoutée au barrel `shared/ui`** (ré-export legacy). Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **127**.
- **Migration clean-archi — `historique-emails` ✅ (longue traîne, lecture seule)** : nouvelle feature migrée de `pages/HistoriqueEmails.tsx` (journal des envois d'emails, lecture seule ; legacy chaînes EN DUR + type local + cast `as EmailLogRow[]` → désormais type inféré `RouterOutputs` + i18n namespace `historiqueEmails`). `domain/email-log.ts` (type `EmailLog` + fonctions PURES `emailStatutKind`/`filterByStatut` + `STATUT_FILTRES` ; **3 tests**) + `application/use-emails.ts` (SEULE couche tRPC : `emails.list` + refresh, lecture seule) + `ui/historique-emails-page.tsx` (StatutBadge via domaine, **0 `any`** — le cast legacy supprimé). Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **124**.
- **Migration clean-archi — `regles-depenses` ✅ (longue traîne + 1 finding)** : nouvelle feature migrée de `pages/ReglesDepenses.tsx` (règles de catégorisation auto à l'import bancaire ; legacy chaînes EN DUR → i18n namespace `reglesDepenses`). `domain/regle.ts` (types `RouterOutputs` + fonctions PURES `normalizeMotif`/`isRegleValid`/`indexCategoriesByNom` ; **3 tests**) + `application/use-regles.ts` (SEULE couche tRPC : getRegles+getCategories, createRegle/deleteRegle) + `ui/regles-depenses-page.tsx` (**0 `any`**). **🔴 FINDING** : le DTO `depenses.getRegles` expose `motifLibelle` (camelCase) mais le legacy lisait `r.motif_libelle` (snake) via `any` → **le badge « Si contient » était VIDE** dans la liste des règles. Corrigé (lecture camelCase ; l'écriture `createRegle` était déjà en `motifLibelle`). Câblage complet (route + V2_ROUTES + i18n + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **120**.
- **Migration clean-archi — `budgets-depenses` ✅ (longue traîne)** : nouvelle feature `budgets-depenses` migrée de `pages/BudgetsDepenses.tsx` (legacy en chaînes EN DUR → i18n namespace `budgetsDepenses`). `domain/budget.ts` (type `Budget` (`RouterOutputs`) + fonctions PURES `budgetTotals`/`consommationPct`/`moisPrecedent`/`budgetLevel`/`clampPct` ; **7 tests** dont passage d'année) + `application/use-budgets.ts` (SEULE couche tRPC : getBudgets + setBudget/copierBudgetsMois) + `ui/budgets-depenses-page.tsx` (édition inline avec drafts locaux, **0 `any`**). Câblage complet (route TanStack `/budgets-depenses` + `V2_ROUTES` + i18n agrégé + sweep e2e). **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **117**.
- **FIX perf+robustesse — chunks périmés (MIME text/html) + dé-batch dashboard élargi ✅ (demandes humaines)** :
  - **Bug « Failed to load module script: MIME type text/html »** (chunk hashé périmé après deploy → SPA-fallback sert index.html en 200 → navigateur refuse le module ; aggravé par le SW qui mettait en cache cette réponse, et par un garde anti-reload « une seule fois pour TOUJOURS »). **3 correctifs** : (1) `client/public/sw.js` — `CACHE_NAME` bump `v2→v3` (purge des entrées EMPOISONNÉES à l'activate) + garde anti-poison (ne JAMAIS cacher une réponse `text/html` servie pour un script/style) ; (2) `client/src/main.tsx` — garde anti-reload **fenêtrée** (recharge si dernier reload > 30 s, au lieu d'une seule fois/session → récupère les déploiements successifs dans un onglet resté ouvert) ; (3) `client/public/_redirects` — NB documenté : Cloudflare Pages n'honore pas un statut 404 dans `_redirects` (seulement 200+3xx), la récupération est donc 100 % côté client. Vérifié post-deploy : asset existant = `application/javascript` 200, navigation = index 200.
  - **Dé-batch dashboard élargi** (2ᵉ demande) : le `splitLink` ne dé-batchait que `dashboard.*` ; les widgets tirent AUSSI `conseilsIA`, `statistiques.getDevisStats`, `activites.list`, `previsions.getTresoreriePrevisionnelle`, `commandesFournisseurs.getEnRetard`, `contrats.getAFacturer`, `stocks.getLowStock` → ajoutés au set non-batché (`DASHBOARD_UNBATCHED`) → chaque bloc fait sa requête et s'affiche dès que SA donnée arrive.
  - **NB dispatcher Pages** : `functions/api/[[path]].js` (proxy `/api/*` → new-stack Fastify, + `x-forwarded-host`) est **TOUJOURS load-bearing** (tout le trafic tRPC du front passe par lui) — NE PAS le supprimer (ne touche pas aux assets/navigation, donc PAS la cause du bug MIME).
- **Dashboard — slice 1 : DÉ-BATCH des requêtes ✅ (demande humaine perf)** : `client/src/main.tsx` — le client tRPC unique (`httpBatchLink`) regroupait toutes les requêtes d'un même tick dans **1 appel HTTP** résolu seulement quand la **plus lente** est prête → tous les blocs du Dashboard attendaient le plus lent. Ajout d'un **`splitLink`** : les `dashboard.*` (getStats/getConversionRate/getAlerts/getObjectifs) passent par un **`httpLink` NON batché** (1 requête/bloc → chaque bloc s'affiche dès que SA donnée arrive = rendu progressif) ; le reste de l'app garde le `httpBatchLink`. Bénéficie **aussi au Dashboard legacy actuel** (la plainte). superjson + `credentials:include` conservés sur les 2 liens. tsc/eslint/vitest 110 verts ; validé au build (deploy). Suite : migration UI Dashboard clean-archi (feature `dashboard`, hooks séparés par widget).
- **Migration clean-archi — `portail-gestion` ✅ (1re page POST-Vague R, née clean-archi)** : nouvelle feature `portail-gestion` (gestion artisan des accès portail client) migrée depuis `pages/PortailGestion.tsx` (legacy en chaînes EN DUR → désormais i18n). `domain/portail-gestion.ts` (types `RouterOutputs` + fonctions PURES `filterClients`/`portalState` (actif/expiré/inactif, `now` injectable) ; **5 tests**) + `application/use-portail-gestion.ts` (SEULE couche tRPC : `usePortailClients` + `useClientPortail` par ligne : getStatus + generateAccess/deactivate) + `ui/portail-gestion-page.tsx` (page + row, **0 `any`**, i18n namespace `portailGestion`). **Câblage complet** : route TanStack `/portail-gestion` (+ addChildren) + `V2_ROUTES` (sidebar→v2) + i18n agrégé + ajout au sweep e2e `PARITE_PAGES`. **Audit §3bis 6/6 ✅** (+ kebab + i18n + route). tsc/eslint(0 err, règle `no-trpc-in-ui` en error respectée)/vitest **110**.
- **Clean-archi — Vague R `signature` ✅ (LA DERNIÈRE 14/14) + verrou `error`** : `domain/signature.ts` (types `RouterOutputs` (`SignatureData`/`SignatureDevis`/`SignatureLigne`/`SignatureOption`) + fonctions PURES `isSignatureProcessed`/`canSubmitSignature`/`buildPdfLignes` ; **4 tests**) + `application/use-signature.ts` (SEULE couche tRPC : getDevisForSignature public + signDevis/refuseDevis/selectDevisOption). `signature-devis-page.tsx` (PUBLIC, ~600 l., canvas signature) consomme hook+domaine, **0 `any`** (dont les casts PDF `(a||{}) as any` retirés ; `options`/`conditionsPaiement`/`dateValidite` étaient déjà sur le type → casts inutiles). **🏁 `no-trpc-in-ui` passé en `error`** (verrou clean-archi). Warnings **1→0**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **105**. **FIN VAGUE R.**
- **Clean-archi — Vague R `comptabilite` ✅ (+ findings champs)** : `domain/comptabilite.ts` (types `RouterOutputs` (Balance/GrandLivre/JournalVentes/FecPreview/TvaDetail + sous-types) + fonctions PURES `balanceTotals`/`ligneSoldeNet`/`toCsv` ; **6 tests**) + `application/use-comptabilite.ts` (SEULE couche tRPC : 6 rapports lecture seule sur une période ; exports FEC/CSV-serveur/PDF/Factur-X = endpoints REST de téléchargement, hors tRPC). `comptabilite-page.tsx` (672 l., bandeau conformité + CA3 + 4 onglets) consomme hook+domaine, **0 `any`**, plus aucun import tRPC. **🔴 FINDING** : le legacy lisait sur `getBalance`/`getGrandLivre` des champs **inexistants** (`compte`/`libelle`/`solde`/`soldeDebit`/`soldeCredit`) via `any` ; les DTO exposent `numeroCompte`/`libelleCompte`/`soldeDebiteur`/`soldeCrediteur`/`totalDebit`/`totalCredit` → **colonnes Compte/Libellé vides + Solde 0 € (balance) et en-têtes de compte vides/0 € (grand livre)**. Corrigé (+ solde net = débiteur−créditeur via `ligneSoldeNet`). Warnings `no-trpc-in-ui` **2→1**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **101**. Prochaine : `signature` (DERNIÈRE).
- **Clean-archi — Vague R `depenses` ✅ (+ 1 bug corrigé via le typage)** : `domain/depense.ts` (types `RouterOutputs` (`Depense`/`DepenseStats`/`Categorie`/`Budget`/`KmClient`) + fonctions PURES `budgetTotal`/`indexCategoriesByNom`/`montantIndemniteKm`/`monthRange`/`buildTrajetMotif` + constantes `TARIF_KM_DEFAULT`/`STATUT_KEYS` ; **5 tests**) + `application/use-depenses.ts` (SEULE couche tRPC : list+stats+categories+budgets, delete/exportFecAchats) + `useIndemniteKm` (clients + creerIndemniteKm). `depenses-page.tsx` (2 composants : page + dialog km) consomme hook+domaine, **0 `any`**, plus aucun import tRPC ; blob FEC + toasts via `onSuccess` par appel. **🔴 FINDING** (même pattern qu'articles) : le DTO `depenses.list` est en **camelCase** (`dateDepense`/`montantTtc`/`justificatifUrl`) mais le legacy lisait du snake_case via `any` → **date "—", montant 0 €, trombone justificatif jamais affiché**. Corrigé (lectures camelCase). Warnings `no-trpc-in-ui` **3→2**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **95**. Prochaine : `comptabilite`.
- **Clean-archi — Vague R `stocks` ✅** (la plus grosse page, ~782 l.) : `domain/stock.ts` (types `RouterOutputs` (`Stock`/`Mouvement`/`StockEntrant`) + fonctions PURES `filterStocks`/`isLowStock`/`totalStockValue`/`indexEntrantByStock`/`previsionnel` ; **5 tests**) + `application/use-stocks.ts` (SEULE couche tRPC : list+lowStock+entrant, create/update/delete/adjustQuantity/generateAlerts) + `useMouvements` (historique d'1 fiche, query dépendante isolée). `stocks-page.tsx` (Tabs + KPIs + alertes + 4 dialogs) consomme hook+domaine, **0 `any`**, plus aucun import tRPC ; fix `adjustQuantity` quantite en `String` conservé. Warnings `no-trpc-in-ui` **4→3**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **90**. Prochaine : `depenses`.
- **Clean-archi — Vague R `commandes` ✅ (+ 1 finding)** : `domain/commande.ts` (types `RouterOutputs` (`Commande`/`CommandeFournisseur`) + fonctions PURES `filterCommandes`/`isCommandeStatut` + `STATUT_KEYS` ; **5 tests**) + `application/use-commandes.ts` (SEULE couche tRPC : list commandes+fournisseurs, delete/sendEmail). `commandes-page.tsx` consomme hook+domaine, **0 `any`** (dont `formatCurrency(value:any)` typé), plus aucun import tRPC. **🔴 FINDING** : le DTO `commandesFournisseurs.list` n'expose **pas** `fournisseurNom` (seulement `fournisseurId`) ; le legacy lisait `cmd.fournisseurNom` via `any` → undefined → **colonne fournisseur vide ("-") + recherche par fournisseur cassée**. Corrigé : nom résolu via la liste des fournisseurs (résolveur injecté au domaine). Warnings `no-trpc-in-ui` **5→4**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **85**. Prochaine : `stocks`.
- **Clean-archi — Vague R `articles` ✅ (+ 2 bugs corrigés via le typage strict)** : `domain/article.ts` (types `RouterOutputs`/`RouterInputs` (`BiblioArticle`/`ImportRow`) + fonctions PURES `filterArticles`/`distinctCategories`/`distinctMetiers`/`computeMarge`/`parseImportCsv`+`splitCsvLine` ; **8 tests** dont parsing CSV) + `application/use-articles.ts` (SEULE couche tRPC : getBibliotheque, create/update/delete/import). `articles-page.tsx` (630 l., 3 dialogs) consomme hook+domaine, **0 `any`**. **🔴 FINDING 1** : le DTO `getBibliotheque` renvoie du **camelCase** (`prixBase`/`sousCategorie`) mais le legacy lisait `prix_base`/`sous_categorie` (snake) via `any` → **undefined → prix affiché 0 €, marge "—", recherche sous-cat cassée**. Corrigé : lectures en camelCase (les écritures restent snake = schéma d'entrée des mutations). **🔴 FINDING 2** : le parsing CSV d'import du legacy désalignait indices valeurs (regex `match` à vides intercalés) vs en-tête (`split`) → colonnes mal mappées à l'import. Corrigé via `splitCsvLine` (découpe quote-aware identique en-tête/valeurs) + détection accent-safe (`métier`). Warnings `no-trpc-in-ui` **6→5**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **80**. Prochaine : `commandes`.
- **Clean-archi — Vague R `fournisseurs` ✅** : `domain/fournisseur.ts` (types `RouterOutputs` (`Fournisseur`/`Article`/`FournisseurArticle`) + fonctions PURES `filterFournisseurs`/`filterArticles`/`fournisseurStats`/`indexArticlesById` ; **6 tests**) + `application/use-fournisseurs.ts` (SEULE couche tRPC : list + articles référentiel, create/update/delete) + `useFournisseurArticles` (articles associés d'1 fournisseur + associate/dissociate, query dépendante isolée). `fournisseurs-page.tsx` (682 l., 4 dialogs) consomme hook+domaine, **0 `any`**, plus aucun import tRPC. Warnings `no-trpc-in-ui` **7→6**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **72**. Prochaine : `articles`.
- **Clean-archi — Vague R `techniciens` ✅** : `domain/technicien.ts` (types `RouterOutputs` (`Technicien`/`LinkableUser`/`TechnicienStats`/`Habilitation`) + fonctions PURES `toTechnicienStatut`/`habilExpiry`/`habilitationBadge` — descripteur de badge d'habilitation (no-expiry/expirée/expire-bientôt≤60j/valide), `now` injectable ; **6 tests**) + `application/use-techniciens.ts` (SEULE couche tRPC : getAll + linkableUsers, create/update/delete) + `useTechnicienDetail` (stats + habilitations + add/delete, queries dépendantes isolées). `techniciens-page.tsx` consomme hook+domaine, **0 `any`**, plus aucun import tRPC. Warnings `no-trpc-in-ui` **8→7**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **66**. Prochaine : `fournisseurs`.
- **Clean-archi — Vague R `notifications` ✅** : `domain/notification.ts` (type `Notification` + `relativeDateDescriptor` PUR — descripteur de date relative déterministe `now` injectable, l'UI mappe vers i18n ; **7 tests**) + `application/use-notifications.ts` (SEULE couche tRPC : list filtrée + getUnreadCount, markAsRead/markAllAsRead/delete + invalidation). `notifications-page.tsx` consomme hook+domaine, **0 `any`** (`typeIcon` typé `LucideIcon`, plus de `Record<string,any>`), plus aucun import tRPC. Warnings `no-trpc-in-ui` **9→8**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **60**. Prochaine : `techniciens`.
- **Clean-archi — Vague R `interventions` ✅** : `domain/intervention.ts` (types `RouterOutputs` + fonctions PURES `filterInterventions`/`groupEquipeByIntervention`/`availableTechniciens`/`buildAdresse`/`dureeDescriptor`/`membreName`/`toInterventionStatut` ; **8 tests**) + `application/use-interventions.ts` (SEULE couche tRPC : list+clients+techniciens+équipes agrégées, create/update/delete) + `useEquipe` (équipe d'1 intervention + add/remove, query dépendante isolée). `interventions-page.tsx` consomme hook+domaine, **0 `any`**, plus aucun import tRPC. **FINDING** : `dureeReelleMinutes` (durée réelle mobile) **absent du DTO `interventions.list`** new-stack (le legacy le lisait → toujours `undefined` → "-") → centralisé dans `domain.dureeReelleMinutes()` (renvoie `null`, parité "-" préservée ; 1 ligne à changer quand le DTO l'expose). Warnings `no-trpc-in-ui` **10→9**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **53**. Prochaine : `notifications`.
- **Clean-archi — Vague R `devis` ✅** : `domain/devis.ts` (types `RouterOutputs` + fonctions PURES `clientLabel`/`filterDevis`/`countByStatut`/`isDevisStatut` + `STATUT_KEYS` ; **7 tests**) + `application/use-devis.ts` (SEULE couche tRPC : list devis+clients, delete/convertToFacture + invalidation). `devis-page.tsx` consomme hook+domaine, **0 `any`**, plus aucun import tRPC (toasts/navigation via `onSuccess` par appel) ; exports PDF/Excel typés `Devis`, nom client via résolveur. Warnings `no-trpc-in-ui` **11→10**. **Audit §3bis 6/6 ✅**. tsc/eslint(0 err)/vitest **45**, parité `37|0` + mutation `1|0`, déployé `d367ee8a` (inclut staleTime défaut + refetchOnWindowFocus). Prochaine : `interventions`.
- **Clean-archi — Vague R `factures` ✅** : `domain/facture.ts` (types `RouterOutputs` + fonctions PURES `clientLabel`/`isBrouillon`/`filterFactures`/`computeEncoursSummary` — filtrage type+statut+recherche & synthèse d'encours avoirs déduits ; **9 tests**) + `application/use-factures.ts` (SEULE couche tRPC : list factures+clients, create/delete, invalidation) + `useClientEncours` (query dépendante isolée). `factures-page.tsx` consomme hook+domaine, **0 `any`**, plus aucun import tRPC (toasts/navigation via `onSuccess` par appel). Warnings `no-trpc-in-ui` **12→11**. tsc/eslint(0 err)/vitest **38**, parité `37|0` + mutation `1|0`, déployé `f1f3fab9`. **Audit §3bis : 6/6 ✅** (3 couches · 0 any · ui sans tRPC · warning 12→11 · 9 tests purs · parité OK). Prochaine : `devis`.
- **Clean-archi — ClientDetail ✅** (feature `clients` 100 % rétrofittée) : `application/use-client-detail.ts` (hook : `clients.getById` + `devis/factures/interventions.list` + `clientPortal.*` + `activites.*`, invalidation centralisée) + domaine pur étendu (`ofClient`, `activitesOfClient`, `sortActivitesByEcheance`, `computeClientStats` + types `ClientDetail/DevisRow/FactureRow/InterventionRow/ActiviteRow/PortalStatus/ActiviteType`). `client-detail-page.tsx` consomme hook+domaine, **0 `any`**, plus aucun import tRPC (toasts/clipboard/reset via `onSuccess` par appel). Warnings `no-trpc-in-ui` **13→12**. tsc/eslint(0 err)/vitest **29** (clients domain 16), parité `37|0` + mutation `1|0`, déployé `c3dd4e9f`. Prochaine : Vague R `factures`.
- **Clean-archi — Clients (liste) ✅ GABARIT** : `application/use-clients.ts` (hook encapsulant tRPC : list/getEncoursMap/update/delete) + `domain/client.ts` (types `RouterOutputs` + fonctions PURES `findDuplicateGroups`/`findCreateDuplicateMatch` renvoyant des clés i18n, **7 tests**). `clients-list-page.tsx` consomme le hook, **0 `any`**, plus aucun import tRPC. Règle eslint **custom `no-trpc-in-ui` (warn)** posée → flague les 13 ui non rétrofittées (clients-list exempte). tsc/vitest(24)/eslint verts, parité `37|0` + mutation `1|0`. Prochaine : ClientDetail.
- **Vague 3 — Signature ✅** port public `/v2/signature/:token` (canvas, options, refus, états ; i18n ; checkbox/separator au barrel ; fix « Invalid Date » legacy). e2e montage déterministe `37|0`, déployé. Prochaine : Portail.
- **Socle public ✅ + Paiement** : 2ᵉ montage TanStack `/v2` PUBLIC (hors auth) dans le `Router` de App ; pages PaiementSucces/Annule portées (i18n). Débloque Signature/Portail. **Broadcast inclut désormais un % de progression** (demande humaine). 4 gates verts, parité e2e `33|0`, déployé. Prochaine : Signature.
- **Vague 3 — Comptabilité ✅** port `/v2/comptabilite` (lecture seule : conformité FEC, TVA/CA3, 4 onglets, exports ; i18n ; double-layout supprimé). 4 gates verts, parité e2e `31|0`, déployé. Prochaine : socle public + pages Paiement.
- **Vague 2 — Dépenses ✅** port `/v2/depenses` (KPIs + filtres + indemnités km, i18n). Finding : `depenses.list` ignore les filtres (pas d'`.input()`). 4 gates verts, parité e2e `29|0`, déployé. **🎉 VAGUE 2 TERMINÉE (6/6).** Prochaine : Vague 3 (Dashboard).
- **Vague 2 — Stocks ✅** port `/v2/stocks` (Tabs + KPIs + 4 dialogs + mouvements/historique, i18n). Supprime double-layout legacy. 4 gates verts, parité e2e `27|0`, déployé. Prochaine : Dépenses (dernière Vague 2).
- **Vague 2 — Commandes ✅** port `/v2/commandes` (filtres statut/fournisseur, actions PDF/email/suppr, i18n namespace `commandes`). 4 gates verts, parité e2e `25|0`, déployé. Prochaine : Stocks.
- **Sidebar → v2 e2e ✅** durci : `scripts/e2e/v2-socle-check.mjs` clique la nav MOBILE (boutons directs) — « Clients » → `/v2/clients`, « Accueil » (non migré) → reste `/dashboard`. `cas:23 | issues:0`. Dette de test sidebar levée. (Test pur, pas de déploiement.)
- **Sidebar → v2 ✅** (demande humaine + recette) : `DashboardLayout` résout sa navigation via `resolveV2Path` → tout lien de route migrée mène à `/v2`, item actif surligné sur `/v2`. Liens profonds tapés à la main restent legacy sauf `?v2=1`.
- **Vague 2 — Interventions ✅** port `/v2/interventions` (dialogs + gestion d'équipe, i18n, StatutBadge partagé). 4 gates verts, parité e2e `21|0`, déployé. Prochaine : Commandes.
- **Vague 2 — Factures ✅** port `/v2/factures` (i18n, StatutBadge partagé, alerte encours + stats + filtres + export CSV, create+delete). 4 gates verts, parité e2e `19|0`, déployé. Prochaine : Interventions.
- **Vague 2 — Devis ✅** port `/v2/devis` (i18n statuts + exports PDF/Excel, `StatutBadge` partagé, delete+convertToFacture). 4 gates verts, parité e2e `17|0`, déployé. Prochaine : Factures. *(Rappel : rejouer l'e2e APRÈS propagation du déploiement — un run trop tôt voit des chunks périmés.)*
- **e2e mutations v2 ✅** `scripts/e2e/v2-mutations.mjs` : cas Clients update (édite Notes via modale → persistance API → REVERT, non destructif), `cas:1 | issues:0`. Sélecteur scopé `.grid.gap-4` (évite les menus sidebar) + rôles Radix (`menuitem`/`button`). Clôt la dette batchée. Test pur (pas de déploiement). Prochaine : Vague 2 (Devis).
- **Vague 1 — Articles ✅** port `/v2/articles` (3 dialogs + import CSV, ~90 clés i18n). 4 gates verts, parité e2e `15|0`, déployé. **🎉 VAGUE 1 TERMINÉE (6/6).** Prochaine : e2e mutations (dette batchée), puis Vague 2.
- **Vague 1 — Fournisseurs ✅** port `/v2/fournisseurs` (4 dialogs, dialog/table/textarea, i18n namespace `fournisseurs`). Supprime le double-DashboardLayout du legacy (finding). 4 gates verts, parité e2e `13|0`, déployé. Prochaine : Articles (dernière Vague 1).
- **Vague 1 — Techniciens ✅** port `/v2/techniciens` (dialog/select/table, i18n namespace `techniciens`, registre bascule). 4 gates verts, parité e2e `11|0`, déployé. Prochaine : Fournisseurs.
- **Vague 1 — ClientDetail ✅** port `/v2/clients/:id` (split gate/contenu → corrige l'antipattern hooks #310 du legacy). **Fix socle `/v2/*`** (le catch-all `/v2/:rest*` cassait les routes imbriquées → 404). Finding : legacy ClientDetail planté. 4 gates verts, e2e `9|0`, déployé.
- **Primitives barrel ✅ (prep slice)** ajout copie conforme `select`/`tabs`/`dialog`/`table`/`textarea` à `modern/shared/ui` (+ test de surface étendu) → débloque ClientDetail, Articles, Fournisseurs, Techniciens. tsc/vitest/eslint verts. Pas de déploiement (ré-exports non consommés par le runtime). Prochaine : port ClientDetail.
- **Vague 1 — Notifications ✅** port conforme `pages/Notifications.tsx` → `/v2/notifications` (`notifications-page.tsx`, kebab+i18n+primitives partagées ; barrel += badge/scroll-area ; registre bascule + route). 4 gates verts, parité e2e `8|0`, déployé. Prochaine : ClientDetail (à splitter).
- **Gate ESLint v2 ✅** `eslint.v2.config.mjs` (scope `client/src/modern/**`) : `no-restricted-imports` (frontière strangler : `@/lib/trpc`/`@/components/ui/*`/openapi interdits ; coutures `shared/{ui,trpc}` exemptées), **règle custom `kebab-filename`**, `i18next/no-literal-string` (jsx-text-only, exclut les glyphes). Strings socle router rétro-i18n (namespace `common`), `_demo` exempté. **eslint v2 vert** + tsc/vitest/parité `6|0`, déployé. Prochaine : ClientDetail.
- **i18n ✅** `react-i18next` + `i18next` installés ; `shared/i18n` (init idempotent, importé par modern-router-mount) ; **un `fr.json` par module** (`features/clients/i18n/fr.json` + `shared/i18n/common/fr.json`) agrégés en namespaces ; `clients-list-page.tsx` **entièrement rétro-i18n** (libellés, toasts, modal, CSV, pluriels). Valeurs `fr` identiques → **parité e2e `6|0`** inchangée. tsconfig.v2 += `resolveJsonModule`. Déployé. Prochaine : gate ESLint v2.
- **Vague 1 — Clients ✅** port conforme complet `pages/Clients.tsx` → `/v2/clients` (clients-list-page.tsx, kebab-case, primitives+tRPC partagés). Parité e2e `6|0`, déployé. PoC supprimé. Convention **kebab-case** + **gate ESLint v2** ajoutés à la recette (demandes humaines). Prochaine : bootstrap du gate ESLint v2.
- **S4 ✅** primitives `modern/shared/ui` (ré-export copie conforme legacy : button/input/card/label/dropdown-menu + barrel) + test de surface. tsc v2 ✅, vitest v2 17 ✅. Pas de déploiement (bundle inchangé). **Vague 0 TERMINÉE.** Prochaine : Vague 1 Clients slice 1a (parité lecture).
- **S3 ✅** client tRPC partagé `modern/shared/trpc` (réexpose l'instance legacy + types `RouterInputs/Outputs`). Feature `clients` migrée **REST→tRPC** (`clients.list`), REST/openapi supprimé du neuf → **dette OPE-366 résorbée**. `tsconfig.v2.json` types += `@fastify/cookie`. 16 tests vitest v2, e2e `4 | 0`, déployé. Incident « plus de devis/factures » = fausse alerte (mauvais compte) ; vérif navigateur OK même flag v2 ON. Prochaine : S4.
- **S2 ✅** flag `?v2=1` + bascule par route (`modern/shared/flag/*`, hook `useV2Bascule` câblé dans App). Tests vitest dédiés (12) via `vitest.v2.config.ts` + e2e socle/bascule `cas testés:4 | issues:0`. Déployé. **Boucle basculée sur CronCreate natif Claude** (daemon bash retiré). Prochaine : S3.
- **S1 ✅** socle TanStack Router sur `/v2/*` (cohabite wouter, providers+auth partagés, lazy, pending/error/notFound par route) + démo `/v2/ping` ; PoC `/v2/clients` repris sous le socle. tsc v2 + `vite build` verts. **Déployé** (Pages) + **vérif navigateur staging** (`scripts/e2e/v2-socle-check.mjs`) : `/v2/ping` rend « pong » **0 erreur** → routing+lazy+providers OK ; `/v2/clients` rend (contenu « Clients » présent) **via le socle**. Prochaine cible : S2 (flag `?v2=1`).
  - ⚠️ **Finding (dette PoC OPE-366, hérité de `09de4d4`, PAS une régression S1)** : `/v2/clients` appelle `GET /api/rest/clients` (openapi-fetch) → **404** (endpoint REST jamais implémenté). À **résorber en Vague 1** en migrant la feature `clients` sur **tRPC** (`@trpc/react-query`) conformément à la mission (« tRPC conservé, pas de REST ») et en supprimant `modern/shared/api/*` (openapi-fetch). Le socle lui-même est OK.

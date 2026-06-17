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
- **Catalogues par feature/namespace** (ex. `clients`), clés stables et descriptives.
- Le **gate ESLint v2** fera respecter ceci via `eslint-plugin-i18next` (`no-literal-string`).
- Pages déjà portées avant l'i18n (ex. Clients) → **rétro-i18n** lors du setup i18n (puis le lint passe).

## Périmètre AUTONOME de la boucle (ne pas déborder)
La boucle ne touche QUE :
- `client/src/modern/**` (tout le code neuf `/v2`),
- `client/src/main.tsx` / `App.tsx` **uniquement** pour câbler le montage `/v2/*` et le flag (ajouts, jamais de suppression de route legacy),
- `scripts/staging-e2e-mutations.mjs` / `scripts/e2e/**` (cas e2e des routes `/v2`),
- `tsconfig.v2.json`, ce journal.

**HORS boucle (traités séparément, NE PAS faire en autonome — ils touchent du code partagé/backend) :**
monorepo OPE-404, garde-fous backend (bodyLimit/errorFormatter/tenant OPE-406/409/410), ESLint global
OPE-413. Si une page en dépend, la marquer **bloquée** et passer à la suivante.

## Coordination multi-agents (règle d'or CLAUDE.md)
D'autres agents travaillent sur `staging` (sujets non-front). **Commits chirurgicaux** : `git add`
de MES chemins explicites, **jamais** `-A`/`.`/`-a`. Pas de `reset --hard`/`rebase -i`/`push --force`.
Ne jamais committer/stash un fichier non suivi d'un autre agent. **Après push, re-vérifier
`origin/staging`** (cherry-pick si un reset concurrent a perdu mon commit).

---

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
   - **Parité visuelle** : via `scripts/pw-run.sh`, screenshot `/v2/<route>` ET `/<route>` legacy →
     comparer : **doivent être identiques** (mêmes éléments, même mise en page, 0 erreur console).
   - **e2e mutation** (si la page mute des données) : cas ajouté dans `scripts/staging-e2e-mutations.mjs`
     (**rouge avant / vert après**) + sweep route `issues:0`. *(Tests lourds : peuvent être batchés sur
     un groupe d'itérations — voir « Dette de tests » plus bas.)*
4. **Mettre à jour ce journal** : cocher la cible, fixer la suivante, noter tout split/blocage.
5. **Diffuser** : `./devtools/testing-loop/broadcast.sh <tag> "<titre>" "<message>"` (journal+ntfy+bus).
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

### Vague 1 — rodage (lecture, fort trafic, UI simple) *(OPE-421)*
- [x] **Clients → `/v2/clients`** (port conforme de `pages/Clients.tsx`) — **page complète** (header, recherche, bandeau doublons, cartes + badge encours + étiquettes, menu actions, modal édition) portée à l'identique (JSX/Tailwind copiés), plomberie repointée : primitives `@/modern/shared/ui` + tRPC `@/modern/shared/trpc` (data déjà tRPC côté legacy → contrat inchangé). PoC `ClientsModernPage` + `use-clients.ts` supprimés. Renommage kebab-case (`clients-list-page.tsx`, `modern-router-mount.tsx`, `ping-page.tsx`). tsc v2 ✅ (corrigé : `target ESNext` + handler `<select>`), vitest v2 17 ✅, **parité e2e `cas:6 | issues:0`** (marqueurs identiques legacy vs /v2 + barre de recherche + bascule), déployé.
  - ⏳ **Dette batchée** : e2e **mutation** (modal édition : modifier Notes → save → persistance → revert) à ajouter dans une itération e2e dédiée (mutations byte-identiques au legacy, contrat tRPC `clients.update/delete` déjà couvert backend). Cf. « Dette de tests (batch autorisé) ».
- [ ] ClientDetail → `/v2/clients/:id`
- [ ] Articles → `/v2/articles`
- [ ] Fournisseurs → `/v2/fournisseurs`
- [ ] Techniciens → `/v2/techniciens`
- [ ] Notifications → `/v2/notifications`

### Vague 2 — listes + mutations *(OPE-422)* — détailler en slices au moment venu
Devis · Factures · Interventions · Commandes · Stocks · Dépenses.

### Vague 3 — critique/public *(OPE-423)*
Dashboard · Signature · Portail · Paiement · Comptabilité · Abonnement.

### Vague 4 — longue traîne + **suppression du legacy** *(OPE-424)*
Reste des pages → bascule routeur racine sur TanStack Router → **suppression complète de l'ancien code**
(wouter + pages legacy migrées) une fois TOUT confirmé. *(C'est l'objectif final : on supprimera
l'ancien code entièrement quand la parité est validée partout.)*

## 🎯 PROCHAINE CIBLE : **Setup i18n (`react-i18next`)** puis rétro-i18n de la page Clients.
Installer `react-i18next` + `i18next`, créer `client/src/modern/shared/i18n/` (init, provider, catalogue `fr`
= libellés actuels à l'identique), monter le provider au-dessus du sous-arbre `/v2`. Puis **rétro-i18n
`clients-list-page.tsx`** (remplacer les chaînes en dur par `t("…")`, namespace `clients`, **parité e2e
inchangée `6|0`**). *(demande humaine — voir section « i18n »)*

### Cibles suivantes (file)
1. **Gate ESLint du code neuf** : `eslint` + parser TS + `eslint.v2.config.mjs` ne lintant QUE
   `client/src/modern/**` : `no-restricted-imports` (interdire `@/lib/trpc`→`@/modern/shared/trpc`,
   `@/components/ui/*`→`@/modern/shared/ui`, `openapi-fetch`/`openapi-react-query`), **règle custom
   kebab-case**, et `eslint-plugin-i18next` `no-literal-string`. Brancher dans la recette, enrichir itér.
2. Vague 1 — ClientDetail `/v2/clients/:id`, Articles, Fournisseurs, Techniciens, Notifications (i18n d'emblée).

> Note coordination boucle : pilotée par **CronCreate natif Claude** (job `834543d1`, toutes les 2 min, session-only → vit tant que le screen `ope-403-refonte-frontend` tourne). Le daemon bash `devtools/refonte-loop/*` est **désactivé** (ne pas le relancer).

---

## Log d'itérations
<!-- broadcast.sh append ici ; ajouter aussi un résumé manuel par itération si utile -->
- `init` boucle créée (journal + prompt + gate tsconfig.v2 + cron 2 min). Prochaine cible : S1.
- **Vague 1 — Clients ✅** port conforme complet `pages/Clients.tsx` → `/v2/clients` (clients-list-page.tsx, kebab-case, primitives+tRPC partagés). Parité e2e `6|0`, déployé. PoC supprimé. Convention **kebab-case** + **gate ESLint v2** ajoutés à la recette (demandes humaines). Prochaine : bootstrap du gate ESLint v2.
- **S4 ✅** primitives `modern/shared/ui` (ré-export copie conforme legacy : button/input/card/label/dropdown-menu + barrel) + test de surface. tsc v2 ✅, vitest v2 17 ✅. Pas de déploiement (bundle inchangé). **Vague 0 TERMINÉE.** Prochaine : Vague 1 Clients slice 1a (parité lecture).
- **S3 ✅** client tRPC partagé `modern/shared/trpc` (réexpose l'instance legacy + types `RouterInputs/Outputs`). Feature `clients` migrée **REST→tRPC** (`clients.list`), REST/openapi supprimé du neuf → **dette OPE-366 résorbée**. `tsconfig.v2.json` types += `@fastify/cookie`. 16 tests vitest v2, e2e `4 | 0`, déployé. Incident « plus de devis/factures » = fausse alerte (mauvais compte) ; vérif navigateur OK même flag v2 ON. Prochaine : S4.
- **S2 ✅** flag `?v2=1` + bascule par route (`modern/shared/flag/*`, hook `useV2Bascule` câblé dans App). Tests vitest dédiés (12) via `vitest.v2.config.ts` + e2e socle/bascule `cas testés:4 | issues:0`. Déployé. **Boucle basculée sur CronCreate natif Claude** (daemon bash retiré). Prochaine : S3.
- **S1 ✅** socle TanStack Router sur `/v2/*` (cohabite wouter, providers+auth partagés, lazy, pending/error/notFound par route) + démo `/v2/ping` ; PoC `/v2/clients` repris sous le socle. tsc v2 + `vite build` verts. **Déployé** (Pages) + **vérif navigateur staging** (`scripts/e2e/v2-socle-check.mjs`) : `/v2/ping` rend « pong » **0 erreur** → routing+lazy+providers OK ; `/v2/clients` rend (contenu « Clients » présent) **via le socle**. Prochaine cible : S2 (flag `?v2=1`).
  - ⚠️ **Finding (dette PoC OPE-366, hérité de `09de4d4`, PAS une régression S1)** : `/v2/clients` appelle `GET /api/rest/clients` (openapi-fetch) → **404** (endpoint REST jamais implémenté). À **résorber en Vague 1** en migrant la feature `clients` sur **tRPC** (`@trpc/react-query`) conformément à la mission (« tRPC conservé, pas de REST ») et en supprimant `modern/shared/api/*` (openapi-fetch). Le socle lui-même est OK.

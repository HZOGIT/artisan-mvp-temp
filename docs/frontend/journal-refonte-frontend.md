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
- **Un `fr.json` par module/domaine**, **co-localisé** avec la feature : `features/<feature>/i18n/fr.json`
  (le commun = `shared/i18n/common/fr.json`). 1 fichier JSON = 1 **namespace** i18next. On les agrège
  dans `shared/i18n/index.ts` (ajouter l'import + le namespace quand une feature est migrée). `en` plus
  tard = déposer les `en.json` à côté. Clés stables et descriptives ; pluriel via `clef_one`/`clef_other`.
  (tsconfig.v2 : `resolveJsonModule`.)
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
   - **Parité visuelle** : via `scripts/pw-run.sh`, screenshot `/v2/<route>` ET `/<route>` legacy →
     comparer : **doivent être identiques** (mêmes éléments, même mise en page, 0 erreur console).
   - **e2e mutation** (si la page mute des données) : cas ajouté dans **`scripts/e2e/v2-mutations.mjs`**
     (actions UI réelles → tRPC + assertion de persistance via API, **non destructif** : modifie puis
     REVERT). **rouge avant / vert après**. *(Tests lourds : peuvent être batchés sur un groupe
     d'itérations — voir « Dette de tests » plus bas.)*
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
- [ ] Dashboard (~16 widgets legacy → stratégie à définir) · Signature · Portail · Paiement (publics → socle public d'abord) · Abonnement.

### Vague 4 — longue traîne + **suppression du legacy** *(OPE-424)*
Reste des pages → bascule routeur racine sur TanStack Router → **suppression complète de l'ancien code**
(wouter + pages legacy migrées) une fois TOUT confirmé. *(C'est l'objectif final : on supprimera
l'ancien code entièrement quand la parité est validée partout.)*

## 🎯 PROCHAINE CIBLE : **Socle — montage `/v2` PUBLIC (hors auth)** + **pages Paiement**
(`PaiementSucces` 60 l. / `PaiementAnnule` 53 l., publiques, post-Stripe). Le routeur neuf est monté
SEULEMENT dans `AuthenticatedRoutes` ; pour les pages publiques (Signature/Portail/Paiement), il faut
monter un second arbre `/v2/*` dans le `Router` public de `App.tsx` (hors DashboardLayout/auth). Établir
ce socle avec les 2 petites pages Paiement, puis enchaîner Signature/Portail.
*(Dashboard reporté : compose ~16 widgets legacy `@/components/dashboard/**` → stratégie widgets à définir.)*

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

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
   - `pnpm exec vitest run <tests touchés>` → vert (adapter les tests existants si besoin).
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

### Vague 0 — Socle (front-additif, visuellement neutre) — EN COURS
- [x] **S1** TanStack Router monté sur `/v2/*` cohabitant avec wouter (QueryClient + auth partagés ; error/pending par route ; lazy). Une route `/v2/ping` de démonstration. *(OPE-415)* — `@tanstack/react-router@1.170.16` ajouté ; socle dans `modern/shared/router/{router.tsx,ModernRouterMount.tsx}` (routage par code, `basepath:/v2`, pending+error+notFound par défaut) ; câblé via catch-all wouter `/v2/:rest*` dans `App.tsx` (DANS `AuthenticatedRoutes` → providers+auth partagés). L'ancien PoC `/v2/clients` repris sous le socle ; démo `/v2/ping`. tsc v2 ✅, `vite build` ✅.
- [ ] **S2** Helper de flag `?v2=1` + util de bascule par route (ouvre `/v2/<route>`, sinon legacy). *(OPE-420)*
- [ ] **S3** Squelette clean-archi `modern/features/<domaine>/{domain,application,ui}` + `modern/shared/{ui,router,lib,trpc}` ; client tRPC partagé (`modern/shared/trpc`). *(OPE-419)*
- [ ] **S4** Primitives `modern/shared/ui` = **copie conforme** des composants UI legacy utilisés par la Vague 1 (zéro changement visuel). *(OPE-416, périmètre réduit)*

### Vague 1 — rodage (lecture, fort trafic, UI simple) *(OPE-421)*
- [ ] Clients → `/v2/clients` (préserver l'UI de `pages/Clients.tsx`)
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

## 🎯 PROCHAINE CIBLE : **S2** (helper de flag `?v2=1` + util de bascule par route : ouvre `/v2/<route>` si activé, sinon legacy). *(OPE-420)*

---

## Log d'itérations
<!-- broadcast.sh append ici ; ajouter aussi un résumé manuel par itération si utile -->
- `init` boucle créée (journal + prompt + gate tsconfig.v2 + cron 2 min). Prochaine cible : S1.
- **S1 ✅** socle TanStack Router sur `/v2/*` (cohabite wouter, providers+auth partagés, lazy, pending/error/notFound par route) + démo `/v2/ping` ; PoC `/v2/clients` repris sous le socle. tsc v2 + `vite build` verts. Reste à déployer le SPA + parité visuelle staging. Prochaine cible : S2 (flag `?v2=1`).

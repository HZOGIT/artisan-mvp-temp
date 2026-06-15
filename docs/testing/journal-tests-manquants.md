# Journal — boucle autonome « tests manquants » (new-stack `src/`)

> **État persistant de la boucle.** La context window est longue : ce fichier est la **mémoire de
> travail** relue à chaque itération (cron 10 min). Issu du spike OPE-316.
> Agent : `ope-316-spike-testing`. Branche : **staging** (rester dessus).

## Mission
Pour CHAQUE cas d'usage, implémenter une **COLONNE de tests** (pas seulement l'unitaire), en
**commençant par les cas d'usage CRITIQUES** de l'application, puis **rétro-compléter** les colonnes
incomplètes. Exécuter, déployer les **fix** sur staging, recommencer. Un autre agent peut travailler en
parallèle → **ne toucher que ce qui me concerne** (mes fichiers de test), rebaser avant d'éditer.

## Approche « colonne de tests » (décidée avec l'humain le 2026-06-15)
Par feature, on vise un slice vertical — **3 niveaux + 1 conditionnel** :

| Niveau | Prouve | Outillage | Quand |
|---|---|---|---|
| **L1** unitaire use-case | branches/règles/validation/bornes/anti-IDOR logique | Vitest + fakes | toujours |
| **L2** intégration repo + RLS | persistance, scope tenant, IDOR-FK, isolation cross-tenant réelle | PG local + `app_tenant` + `expectCrossTenantDenied` | si repo Drizzle |
| **L3** e2e tRPC (router) | 401/400/404/409, cross-tenant 404, superjson | `injectTrpc` + PG | si router tRPC (ou route HTTP → `app.inject`) |
| **L4** e2e navigateur | parcours utilisateur réel via l'edge public | Playwright (`pw-run.sh`) | **chemins critiques seulement** |

**Règle** : fonction pure → L1 seul ; use-case avec repo+router → L1+L2+L3 ; chemin critique → +L4.
Une itération **avance la colonne d'UNE feature** (1 à 3 fichiers ; grosse feature = 2 itérations).

## Canaux de documentation (4)
1. **Journal** (ce fichier) — log d'itérations en bas.
2. **Linear** — issue de suivi **OPE-318** (commentaires par itération/jalon).
3. **ntfy** — `devtools/agents/ntfy-pub.sh` (topic public `operioz-claude-code-2026`).
4. **Bus inter-agents** — `devtools/agents/notify.sh` (→ human).
   → Helper unique pour 1+3+4 : `devtools/testing-loop/broadcast.sh <tag> <titre> <message>`.

## Runbook d'une itération (idempotent)
```bash
cd /home/developer/artisan-mvp-temp
export DOCKER_HOST=${DOCKER_HOST:-unix:///run/user/1001/docker.sock}
export DATABASE_URL="postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp"  # PG local bootstrappé (app_tenant + RLS)
git fetch origin && git rebase origin/staging      # se resynchroniser (coordination multi-agents)
./devtools/agents/listen.sh ope-316-spike-testing --drain   # lire mes messages, agir si besoin
```
1. **Prendre la FEATURE en tête du backlog critique** (cf. « Backlog par criticité ») et identifier le
   **niveau de colonne manquant le plus prioritaire** (L2 RLS / L3 router / L1 / L4). Vérifier qu'aucun
   autre agent ne l'a prise (git log récent, bus). Ne PAS recréer un niveau déjà couvert.
2. **Écrire le test du niveau visé**, patterns canon :
   - L1 use-case → `*.test.ts` + **fakes**. Réf : `src/modules/devis/application/write-use-cases.test.ts`.
   - L2 repo Drizzle → `*-drizzle.test.ts` + RLS + `expectCrossTenantDenied`. Réf : `src/modules/devis/infra/devis-repository-drizzle.test.ts`.
   - L3 router tRPC → `*.router.test.ts` via `injectTrpc`. Réf : `src/modules/devis/interface/trpc/devis.router.test.ts`. (Route HTTP → `app.inject`, réf : `src/interface/http/paiement-route.test.ts`.)
   - L4 navigateur → `scripts/e2e/*.journey.mjs` (chemins critiques). Réf : `scripts/e2e/devis-to-paiement.journey.mjs`.
3. **Exécuter** : `pnpm exec tsc -p tsconfig.src.json` (rapide, optionnel) + `pnpm exec vitest run <fichier>`.
   - Rouge à cause du test → corriger le test.
   - Rouge à cause d'un **vrai bug** dans `src/` → fix **minimal**, le signaler (tag `fix`), et **déployer**.
4. **Mettre à jour ce journal** : cocher la cible, fixer la suivante.
5. **Diffuser** : `./devtools/testing-loop/broadcast.sh <tag> "<titre>" "<message>"` (ajoute aussi la ligne
   de log au journal — d'où l'ordre : broadcast AVANT le commit, pour éviter un arbre sale au prochain rebase).
6. **Commit UNIQUE** (scope strict : `git add <mes test(s)> docs/testing/journal-tests-manquants.md`,
   **jamais** `-A`) sur `staging`, puis push + RE-VÉRIFIER `origin/staging`.
   Message : `test(<module>): <quoi>` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
7. **Déployer** sur staging **uniquement si un fix `src/` a été livré** : `./devtools/deploy-staging-newstack.sh`.
   (Un ajout de test pur ne change pas le runtime → pas de déploiement.)
8. **Créer l'issue Linear** enfant de OPE-318 (« test(<module>): … », Done).

## Règles de coordination
- `git rebase origin/staging` avant toute édition ; en cas de conflit sur un fichier que je n'ai pas
  créé → abandonner ma version de ce fichier, ne garder que mes tests.
- Ne jamais `git add -A`. Toujours `git add <chemins précis de mes tests>`.
- Ne pas déployer si `git status` montre des fichiers non suivis appartenant à un autre agent.
- Push best-effort : `git push origin staging` (si refus/non-fast-forward → rebase puis retry une fois).
- **Après push, RE-VÉRIFIER `origin/staging`** (`git fetch && git log origin/staging --oneline | grep <hash>`) :
  des agents concurrents peuvent **reset la branche** et perdre mon commit → le **cherry-pick** pour le récupérer.
- **`git rebase` peut échouer « Please commit or stash them » à cause d'un fichier non commité d'un
  AUTRE agent** (working tree partagé, ex. `client/src/...`). Ne PAS le stash/commit. Mon commit
  passe quand même en fast-forward ; si le push est rejeté (origin a divergé), faire
  `git fetch && git merge --ff-only origin/staging` (ou rebase ciblé sur MES commits) puis retry.

## Backlog par CRITICITÉ — compléter les COLONNES (ordre = priorité)
Légende colonne : ✅ couvert · ⬜ manquant · — non applicable. (état au 2026-06-15, à revérifier.)

| # | Feature critique | L1 | L2 RLS | L3 router/HTTP | L4 nav | Trous à combler (prioritaire) |
|---|---|----|--------|----------------|--------|------|
| 1 | **Portail client public** (`client-portal`) | ✅ | ✅ | ✅ | (PoC) | **COLONNE COMPLÈTE** (L2 it.10-12, L3 router it.13). L4 = PoC portail OPE-316 |
| 2 | **Signature devis** (`signature`) | ✅ | ✅ | ✅ | (PoC) | **COLONNE COMPLÈTE** (L3 : e2e.test getDevis/signDevis + router.test it.14 admin/refuse) |
| 3 | **Abonnement / billing** (`subscription`) | 🟡 | ✅ | ✅ | — | L1 use-cases déjà couvert (effects.test) + L3 router it.15 ; **reste L1** subscription-event-notifier |
| 4 | **Auth / session** (`auth`) | ⬜ | ✅ | ⬜ | — | **L1** emails.ts → **L3** auth.router (signin/me/logout, 401) |
| 5 | **Paiement Stripe** (`paiement`) | ✅ | ✅ | ✅ (route HTTP) | (PoC) | colonne ~complète ; vérifier portal-payment-writer drizzle |
| 6 | **Facturation** (`factures`) | ✅ | ✅ | ✅ | ⬜ | L4 couvert par le PoC devis→paiement ; rien d'urgent |
| 7 | **Devis** (`devis`) | ✅ | ✅ | ✅ | ⬜ | idem — colonne complète hors L4 |

### Rétro-complétion (use-cases déjà testés L1 seul — it.1→9) — APRÈS les colonnes critiques
Ajouter L2/L3 là où la feature a repo+router : `stocks/alertes`, `depenses/budgets-realises`,
`commandes/devis-acceptes`, `rdv-en-ligne` (propose/confirm). Les fonctions pures (numero, comptes,
isSearchable, bibliotheque délégation) restent **L1 seul** (pas de repo/router → rien à ajouter).

### Use-cases L1 encore nus (non critiques — plus bas)
`clients/import-use-cases`, `contrats-maintenance/contrat-facture-generator`, `devis/devis-to-facture-converter`.

**Prochaine cible : `subscription` — fin L1 : `subscription-event-notifier.test.ts`** (fake `subscription-event-notifier-fake` dispo). Clôt la colonne abonnement. Puis feature #4 `auth` : L1 `emails.ts` → L3 `auth.router`.
(NB : `use-cases.ts` est déjà couvert par `effects.test.ts` — ne pas recréer.)

---

## Log d'itérations
- `2026-06-15 16:33Z` **[start]** Boucle initialisée — DB locale bootstrappée (app_tenant+RLS), pipeline test vert, helper broadcast + journal + issue Linear prêts. Cron 10 min armé.
- `2026-06-15 16:34:54Z` **[done]** notes-de-frais/numero — computeNextNoteFraisNumero couvert (5 cas), commit 55a34f5 sur staging. Pipeline boucle validé.
- `2026-06-15 16:43:09Z` **[done]** ecritures/comptes — compteTvaCollectee + constantes PCG couverts (6 cas), commit 2d9c68a sur staging.
- `2026-06-15 16:53:30Z` **[done]** stocks/alertes — genererAlertesStock couvert (4 cas : vide, 1 notif/item, scope tenant, pas de dedup).
- `2026-06-15 17:03:27Z` **[done]** rdv-en-ligne/propose — proposerAutreCreneau couvert (4 cas : anti-IDOR, bornes date, validation avant mutation, copie+refus).
- `2026-06-15 17:13:15Z` **[done]** rdv-en-ligne/confirm — confirmerRdvAvecIntervention couvert (4 cas : anti-IDOR, garde statut, création intervention planifiée + lien, durée défaut 60).
- `2026-06-15 17:23:48Z` **[done]** depenses/budgets-realises — budgetsRealises couvert (4 cas : croisement budget/réel+pct, sans dépense, budget 0 sans div/0, scope tenant).
- `2026-06-15 17:33:36Z` **[done]** commandes/devis-acceptes — listerDevisAcceptes couvert (4 cas : filtre accepte, enrichissement nom client, fallback Client, mapping objet/total/date).
- `2026-06-15 17:43:07Z` **[done]** articles/public-article-search — isSearchable couvert (4 cas : >=2 char, trop court, trim espaces, requête valide entourée d'espaces).
- `2026-06-15 17:53:36Z` **[done]** articles/bibliotheque — use-cases catalogue couverts (6 cas : délégation list/search/create/delete/import + NotFound sur update inexistant).
- `2026-06-15 18:02:38Z` **[info]** boucle réorientée — Colonne de tests (L1/L2/L3/L4) par cas d'usage, priorité CRITIQUES. Cron 18363af8. Prochaine: client-portal L2 RLS. commit b5f4927.
- `2026-06-15 18:12:21Z` **[done]** client-portal L2 portal-access — RLS public-token + scope tenant couvert (7 cas : resolveByToken actif/expiré/inactif/inconnu, createAccess remplace, status/deactivate, getClientInfo cross-tenant, getArtisanPublic).
- `2026-06-15 18:22:44Z` **[done]** client-portal L2 docs-reader — RLS docs portail couvert (5 cas : devis/factures/interventions/contrats scopés tenant+client, lien paiement en_attente, contrats sans notes, anti-IDOR cross-tenant).
- `2026-06-15 18:32:20Z` **[done]** client-portal L2 scheduling — RLS planification portail couvert (3 cas : créneaux occupés filtrés, createRdv+getRdvByClient cross-tenant, chantiers+étapes visibles client). L2 client-portal COMPLET.
- `2026-06-15 19:06:43Z` **[done]** client-portal L3 router — COLONNE COMPLÈTE — 5 cas e2e tRPC (verifyAccess valid/invalid, getDevis public + 401 token inconnu, generateAccess 401 sans cookie + happy path admin). Portail public = 1re colonne L1+L2+L3 complète.
- `2026-06-15 19:35:14Z` **[done]** signature L3 router — COLONNE COMPLÈTE — 5 cas e2e (createSignatureLink admin 401+idempotent, getSignatureByDevis, refuseDevis token→refuse+400 immutable+404). Sans dupliquer signature.e2e. Signature = 2e colonne complète.
- `2026-06-15 20:05:39Z` **[done]** subscription L3 router — 4 cas e2e billing (5 procédures protégées 401 sans cookie, getCurrent défaut trial, createPortal/cancel sans Customer→404). L1 use-cases déjà couvert par effects.test.

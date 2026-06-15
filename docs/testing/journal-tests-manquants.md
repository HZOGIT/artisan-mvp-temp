# Journal — boucle autonome « tests manquants » (new-stack `src/`)

> **État persistant de la boucle.** La context window est longue : ce fichier est la **mémoire de
> travail** relue à chaque itération (cron 10 min). Issu du spike OPE-316.
> Agent : `ope-316-spike-testing`. Branche : **staging** (rester dessus).

## Mission
Explorer les tests manquants du new-stack, les implémenter (conventions existantes), les exécuter,
déployer les **fix** sur staging, recommencer. Un autre agent peut travailler en parallèle →
**ne toucher que ce qui me concerne** (mes fichiers de test), rebaser avant d'éditer, ne jamais
committer le travail d'un autre.

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
1. **Choisir UNE cible** dans le backlog (fichier source `src/**` sans test sibling, logique réelle —
   PAS un port/interface). Vérifier qu'aucun autre agent ne l'a prise (git log récent, bus).
2. **Écrire le test** selon la couche, en s'appuyant sur les patterns canon :
   - use-case pur → `*.test.ts` + **fakes** (`infra/*-fake.ts`, `src/shared/ports/fakes.ts`). Réf : `src/modules/devis/application/write-use-cases.test.ts`.
   - repo Drizzle → `*-drizzle.test.ts` + RLS + `expectCrossTenantDenied`. Réf : `src/modules/devis/infra/devis-repository-drizzle.test.ts`.
   - router → `*.router.test.ts` via `injectTrpc`. Réf : `src/modules/devis/interface/trpc/devis.router.test.ts`.
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

## Backlog — fichiers source sans test (à trier : garder la logique, écarter les ports)
> Recalculable :
> `for f in $(find src/modules -path '*/application/*.ts' ! -name '*.test.ts'); do t="${f%.ts}.test.ts"; [ -f "$t" ] || echo "$f"; done`

- [ ] `src/modules/articles/application/bibliotheque-use-cases.ts`
- [ ] `src/modules/articles/application/public-article-search.ts`
- [ ] `src/modules/clients/application/import-use-cases.ts`
- [ ] `src/modules/commandes/application/devis-acceptes-use-cases.ts`
- [ ] `src/modules/contrats-maintenance/application/contrat-facture-generator.ts`
- [ ] `src/modules/depenses/application/budgets-realises-use-case.ts`
- [ ] `src/modules/devis/application/devis-to-facture-converter.ts`
- [x] `src/modules/ecritures/application/comptes.ts` → `comptes.test.ts` (6 cas) ✅ it.2
- [x] `src/modules/notes-de-frais/application/numero.ts` → `numero.test.ts` (5 cas) ✅ it.1
- [x] `src/modules/rdv-en-ligne/application/confirm-use-cases.ts` → `confirm-use-cases.test.ts` (4 cas) ✅ it.5
- [x] `src/modules/rdv-en-ligne/application/propose-use-cases.ts` → `propose-use-cases.test.ts` (4 cas) ✅ it.4
- [x] `src/modules/stocks/application/alertes-use-cases.ts` → `alertes-use-cases.test.ts` (4 cas) ✅ it.3
- [ ] `src/modules/subscription/application/use-cases.ts`
- [ ] `src/modules/subscription/application/subscription-event-notifier.ts`
- [ ] `src/modules/auth/application/emails.ts`
- _Écartés (ports/interfaces, pas de logique à tester)_ : `assistant/agentic-port.ts`,
  `factures/compta-port.ts`, `factures/contact-readers.ts`.

**Prochaine cible : `src/modules/depenses/application/budgets-realises-use-case.ts`** (calcul budgets réalisés).

---

## Log d'itérations
- `2026-06-15 16:33Z` **[start]** Boucle initialisée — DB locale bootstrappée (app_tenant+RLS), pipeline test vert, helper broadcast + journal + issue Linear prêts. Cron 10 min armé.
- `2026-06-15 16:34:54Z` **[done]** notes-de-frais/numero — computeNextNoteFraisNumero couvert (5 cas), commit 55a34f5 sur staging. Pipeline boucle validé.
- `2026-06-15 16:43:09Z` **[done]** ecritures/comptes — compteTvaCollectee + constantes PCG couverts (6 cas), commit 2d9c68a sur staging.
- `2026-06-15 16:53:30Z` **[done]** stocks/alertes — genererAlertesStock couvert (4 cas : vide, 1 notif/item, scope tenant, pas de dedup).
- `2026-06-15 17:03:27Z` **[done]** rdv-en-ligne/propose — proposerAutreCreneau couvert (4 cas : anti-IDOR, bornes date, validation avant mutation, copie+refus).
- `2026-06-15 17:13:15Z` **[done]** rdv-en-ligne/confirm — confirmerRdvAvecIntervention couvert (4 cas : anti-IDOR, garde statut, création intervention planifiée + lien, durée défaut 60).

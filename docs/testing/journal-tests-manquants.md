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
| 3 | **Abonnement / billing** (`subscription`) | ✅ | ✅ | ✅ | — | **COLONNE COMPLÈTE** (L1 effects.test + webhook ; L3 it.15). event-notifier = port (écarté) |
| 4 | **Auth / session** (`auth`) | ✅ | ✅ | ✅ | — | **COLONNE COMPLÈTE** (L1 emails it.16 ; L3 router it.17 : me/signin/gardes) |
| 5 | **Paiement Stripe** (`paiement`) | ✅ | ✅ | ✅ (route HTTP) | (PoC) | colonne ~complète ; vérifier portal-payment-writer drizzle |
| 6 | **Facturation** (`factures`) | ✅ | ✅ | ✅ | ⬜ | L4 couvert par le PoC devis→paiement ; rien d'urgent |
| 7 | **Devis** (`devis`) | ✅ | ✅ | ✅ | ⬜ | idem — colonne complète hors L4 |

### Rétro-complétion (use-cases déjà testés L1 seul — it.1→9) — ✅ RIEN À FAIRE (vérifié it.18)
Scan confirmé : `rdv-en-ligne`, `stocks`, `depenses`, `commandes` ont **déjà** leur L2 (drizzle) ET L3
(router) ; mes ajouts L1 (it.3-7) comblaient les seuls trous. Les fonctions pures (numero, comptes,
isSearchable, bibliotheque) restent **L1 seul**. → Rétro-complétion sans objet.

### Use-cases L1 — ✅ ÉPUISÉ (it.19)
- [x] `clients/import-use-cases` → test it.18.
- `contrats-maintenance/contrat-facture-generator` + `devis/devis-to-facture-converter` = **ports** (interfaces) → écartés.
- Plus aucun fichier `application/*.ts` avec `export function` sans test (subscription/use-cases couvert par effects.test).

### Logique transverse (domain / shared) sans test — NOUVEAU FRONT (scan it.19)
- [x] `shared/date/add-months-clamped.ts` → `add-months-clamped.test.ts` (8 cas) ✅ it.19
- [x] `shared/ia/sanitize-ia-error.ts` → `sanitize-ia-error.test.ts` (6 cas) ✅ it.20
- [x] `shared/pdf/facturx.ts` → `facturx.test.ts` (6 cas) ✅ it.21
- [x] `shared/zip/zip-entries.ts` → `zip-entries.test.ts` (4 cas) ✅ it.22
- [ ] `shared/pdf/pdf-generator.ts` (probable wrapper jsPDF — vérifier testabilité)
- [x] `parametres/domain/parametres.ts` → `parametres.test.ts` (5 cas) ✅ it.23
- [x] `config-relances/domain/config-relances.ts` → `config-relances.test.ts` (5 cas) ✅ it.24
- [x] `assistant/domain/assistant.ts` → `assistant.test.ts` (6 cas) ✅ it.25
- [x] `devis-ia/domain/analyse-photos.ts` → `analyse-photos.test.ts` (13 cas) ✅ it.26
- _Écartés_ : `shared/testing/trpc-inject.ts` (outil de test), `shared/db/client.ts` (adapter infra).

🏁 **Les 4 colonnes critiques prioritaires sont COMPLÈTES** (portail, signature, abonnement, auth).

### NOUVEAU FRONT (scan global it.27) — routers tRPC sans L3 e2e
Scan : fonctions/arrow + classes sans test = **0** (tout couvert). Restent **les routeurs tRPC sans test L3**
(modules non critiques). Pattern : `buildApp({jwtSecret})` + `injectTrpc`, garde 401 + happy path + validation.
- [x] `artisan` → `artisan.router.test.ts` (4 cas) ✅ it.27
- [x] `utilisateurs` → `utilisateurs.router.test.ts` (4 cas, garde permission 401/403/200) ✅ it.28
- [x] `devices` → `devices.router.test.ts` (4 cas) ✅ it.29
- [x] `comptabilite` → `comptabilite.router.test.ts` (3 cas, garde permission) ✅ it.30
- [x] `dashboard` → `dashboard.router.test.ts` (3 cas, 6 lectures 200) ✅ it.31
- [x] `statistiques` → `statistiques.router.test.ts` (2 cas) ✅ it.32
- [x] `search` → `search.router.test.ts` (3 cas) ✅ it.33
- [x] `chat` → `chat.router.test.ts` (3 cas) ✅ it.34
- [ ] reste : activites, alertes-previsions, assistant, calendrier, conseils-ia, devis-ia, devis-options,
  emails, feature-modules, geolocalisation, import-erp, integrations-comptables, interventions-mobile,
  rapports, support, vitrine. (Recalcul : `for f in $(find src -name '*.router.ts'); do t="${f%.ts}.test.ts"; [ -f "$t" ] || echo "$f"; done`)

🏁 **TOUS LES ROUTEURS tRPC SONT COUVERTS L3** (vérifié it.50 : `find src -name '*.router.ts'` sans test = **0**). 24 routeurs L3 ajoutés par la boucle (it.13-50), `vitrine` ✅ it.50 inclus.

## 🏁 L1/L2/L3 ÉPUISÉS (scan global it.51)
Vérifié it.51 : **0** fichier `src/**` (fonction/classe/arrow) sans test ; **0** handler `interface/http` sans test ;
**0** routeur tRPC sans L3. Garde-fou anti-régression posé : `src/interface/trpc/router-coverage.test.ts` (it.51).

**Front suivant possible (arbitrage humain conseillé) :**
- **L4 navigateur** (chemins critiques restants non couverts par le PoC OPE-316) : journey **abonnement Stripe**
  (login → checkout → URL `checkout.stripe.com`). ⚠️ dépend des price IDs Stripe configurés sur staging
  (sinon 400) → à valider avant d'en faire un test « vert » stable. Pattern : `scripts/e2e/*.journey.mjs`.
- **Garde-fous supplémentaires** (T2-like) : meta-test « tout `*-drizzle.ts` a un sibling test » ; cohérence
  use-case=test.
- **Mutation testing ciblé** (Stryker, T8) sur domaine/montants — nightly, hors boucle 30 min.

### ⚠️ NOUVEAU FRONT (scan it.52) — adapters Drizzle L2 sans test : **27** (sur 91)
Le garde-fou L2 serait ROUGE → ce sont de vraies lacunes à combler (pas un guard). Priorité aux readers/
repos des features critiques d'abord. Liste (recalculable : `for f in $(find src -name '*-drizzle.ts' ! -name '*.test.ts'); do t="${f%.ts}.test.ts"; [ -f "$t" ] || echo "$f"; done`) :
- [x] `signature/infra/signature-repository-drizzle.ts` → test (3 cas, persistance hors-RLS) ✅ it.52
- [x] `paiement/infra/portal-payment-writer-drizzle.ts` → test (2 cas, RLS écriture + isolation cross-tenant) ✅ it.53
- [x] `devices/infra/device-repository-drizzle.ts` → test (3 cas, anti-IDOR par user_id, hors RLS) ✅ it.54
- [x] `signature/infra/signature-context-reader-drizzle.ts` → test (4 cas, RLS lecture contexte + anti-IDOR + notif isolée) ✅ it.55
- [x] `factures/infra/{client,devis,artisan}-reader-drizzle.ts` → test `contact-readers-drizzle.test.ts` (4 cas, RLS round-trip + anti-IDOR) ✅ it.56
- [x] `ecritures/infra/facture-reader-drizzle.ts` → test (2 cas, RLS round-trip getFacture/getLignes + anti-IDOR) ✅ it.57
- [x] avis flux public → `public-avis-flow-drizzle.test.ts` (4 cas) ✅ it.58
- [x] `avis/infra/demande-avis-repository-drizzle.ts` → test (3 cas, RLS ownership + anti-IDOR + creerDemande) ✅ it.59 — **COLONNE AVIS L2 COMPLÈTE**
- [x] `commandes/infra/artisan-reader-drizzle.ts` → test (2 cas, RLS émetteur courant) ✅ it.60 — **COLONNE COMMANDES L2 COMPLÈTE**
- [x] `articles/infra/public-article-search-drizzle.ts` → test (4 cas, catalogue public hors RLS : visible + ILIKE + filtres + tri) ✅ it.61
- [x] `vitrine/infra/vitrine-public-reader-drizzle.ts` → test (5 cas : slug hors-RLS, params, avis publiés, stats, catégories) ✅ it.62
- [x] `calendrier/infra/ical-public-reader-drizzle.ts` → test (3 cas : token résolu + filtre since + tri + enrichissement, isolation, token inconnu null) ✅ it.63
- [x] `chat/infra/chat-client-notifier-drizzle.ts` → test (4 cas : email+lien portail, sans email no-op, rate-limit no-op, anti-IDOR) ✅ it.64
- [ ] import-erp, integrations-comptables, alertes-previsions, assistant/thread-writer,
  devis/devis-signature-reader, devis-ia, interventions-mobile, comptabilite/factures-csv-reader, artisan/logo-writer,
  subscription/event-notifier, shared/readers/contact-readers.
  ⚠️ Beaucoup sont des **readers RLS scopés tenant** → test L2 = round-trip + **anti-IDOR cross-tenant** (`expectCrossTenantDenied`).
  Quelques-uns sont hors-RLS (signature, ical public, contact public) → test = persistance/round-trip simple.

**Prochaine cible : `import-erp/infra/import-erp-repository-drizzle.ts`** (L2 ; repo d'import ERP — RLS, persistance/lecture scopée tenant + anti-IDOR cross-tenant). Puis integrations-comptables, alertes-previsions, puis le reste des ~12 adapters Drizzle.

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
- `2026-06-15 20:34:38Z` **[done]** auth L1 emails — welcomeEmail/resetPasswordEmail couverts (5 cas : interpolation nom, fallback URL, anti-XSS échappement HTML, resetUrl+validité). subscription-event-notifier = port (écarté), colonne abonnement close.
- `2026-06-15 21:05:30Z` **[done]** auth L3 router — 4 COLONNES CRITIQUES COMPLÈTES — 6 cas e2e auth (me null/authentifié, signin 401 mauvais pw + email inconnu, signin OK, updateEmail 401). Portail+signature+abonnement+auth = colonnes complètes. Bascule en rétro-complétion.
- `2026-06-15 21:35:40Z` **[done]** clients import-use-cases L1 — importerClients couvert (4 cas : tout valide, best-effort skip lignes invalides, tableau vide, scope tenant). Rétro-complétion vérifiée sans objet (rdv/stocks/depenses/commandes ont déjà L2+L3).
- `2026-06-15 22:05:06Z` **[done]** shared/date add-months-clamped L1 — addMonthsClamped couvert (8 cas : ajout simple, clamp fin de mois bissextile/non, rollover année, n négatif, n=0, pureté). Backlog application L1 épuisé → nouveau front domain/shared.
- `2026-06-15 22:34:26Z` **[done]** shared/ia sanitize-ia-error L1 — sanitizeIaError couvert (6 cas : extraction .message, chaîne brute, fallback null/undefined, masquage image base64 + blob long […], troncature 200). Sécurité : pas de fuite de payloads dans les erreurs IA.
- `2026-06-15 23:04:42Z` **[done]** shared/pdf facturx L1 — generateFacturXML couvert (6 cas : profil minimum/380/EUR/FR, dates CII 102, montants 2 déc + taux défaut, SIRET/TVA conditionnels, échappement XML anti-injection, échéance optionnelle).
- `2026-06-15 23:34:40Z` **[done]** shared/zip zip-entries L1 — zipEntries couvert (4 cas : Buffer ZIP valide magic PK + nom d'entrée, multi-fichiers, contenu binaire Buffer, liste vide → EOCD).
- `2026-06-16 00:04:37Z` **[done]** parametres/domain L1 — defaultParametres couvert (5 cas : artisanId, préfixes DEV/FAC/AV + compteurs=1, défauts métier paiement/rappels/objectifs/couleurs, optionnels null, invariance inter-tenant).
- `2026-06-16 00:34:37Z` **[done]** config-relances/domain L1 — defaultConfigRelances couvert (5 cas : artisanId, inactif par défaut opt-in, cadence 7/7/3, fenêtre 09:00 jours ouvrés, invariance inter-tenant).
- `2026-06-16 01:04:49Z` **[done]** assistant/domain L1 — clampThreadsLimit/clampMessagesLimit couverts (6 cas : défaut sur undefined/0, plancher décimal, min 1 sur négatif, max borné). Quirk 0→défaut pinné.
- `2026-06-16 01:35:00Z` **[done]** devis-ia/domain analyse-photos L1 — 5 fonctions couvertes (13 cas) : buildImageBlocks, buildSystemPrompt (métier/casse/générique), parseAnalyseResponse (markdown/extraction/null), sanitizeVisionError, matchBibliotheque. Front domain/shared épuisé.
- `2026-06-16 02:05:31Z` **[done]** artisan L3 router — 4 cas e2e profil (getProfile/updateProfile 401 sans cookie, getProfile tenant, update reflété, validation email/spécialité 400). NOUVEAU FRONT : 24 routers tRPC sans L3 (scan global fonctions/classes = 0).
- `2026-06-16 02:35:45Z` **[done]** utilisateurs L3 router — 4 cas e2e gardé par permission : 401 sans cookie, 403 sans utilisateurs.gerer, 200 après octroi, invite rôle hors enum → 400. Valide la chaîne auth→tenant→permission.
- `2026-06-16 03:04:55Z` **[done]** devices L3 router — 4 cas e2e sessions (list/revoke/revokeAll 401 sans cookie, list 200, revokeAll 200, revoke deviceId non positif → 400).
- `2026-06-16 03:34:40Z` **[done]** comptabilite L3 router — 3 cas e2e gardé par comptabilite.voir : 401 sans cookie, 403 sans permission, 200 (balance + FEC preview) après octroi.
- `2026-06-16 04:04:40Z` **[done]** dashboard L3 router — 3 cas e2e : getStats 401 sans cookie ; 6 lectures agrégées 200 (stats/recentActivity/monthlyCA/topClients/objectifs/alerts) ; getRecentActivity limit>500 → 400.
- `2026-06-16 04:34:46Z` **[done]** statistiques L3 router — 2 cas e2e : getDevisStats 401 sans cookie, 200 avec cookie (agrégats tenant).
- `2026-06-16 05:04:47Z` **[done]** search L3 router — 3 cas e2e : global 401 sans cookie, 200 requête valide, validation requête vide/>100 → 400.
- `2026-06-16 05:34:46Z` **[done]** chat L3 router — 3 cas e2e messagerie : 401 sans cookie (getConversations/getMessages/sendMessage), getConversations+getUnreadCount 200, validation contenu vide + startConversation sans clientId → 400.
- `2026-06-16 06:04:47Z` **[done]** calendrier L3 router — 3 cas e2e flux iCal : 401 sans cookie, getIcalFeed 200 + path idempotent, regenerate rotation du jeton (path différent).
- `2026-06-16 06:34:40Z` **[done]** rapports L3 router — 3 cas e2e : list/create 401 sans cookie, create 200 + visible dans list, validation nom vide / type hors enum → 400.
- `2026-06-16 07:04:47Z` **[done]** emails L3 router — 3 cas e2e journal emails : list 401 sans cookie, 200 + filtre entité, validation limit>500 / entiteType hors enum → 400.
- `2026-06-16 07:34:25Z` **[done]** activites L3 router — 3 cas e2e suivi commercial : list/create 401 sans cookie, create 200 + visible dans list, validation titre vide / type hors enum → 400.
- `2026-06-16 08:04:51Z` **[done]** feature-modules L3 router — 3 cas e2e modules/onboarding : list 401 sans cookie, list/getMine/getOnboardingStatus 200, toggle sans actif → 400.
- `2026-06-16 08:34:25Z` **[done]** geolocalisation L3 router — 2 cas e2e : getPositions 401 sans cookie, 200 tableau avec cookie.
- `2026-06-16 09:04:38Z` **[done]** devis-options L3 router — 4 cas e2e : 401 sans cookie, create 200 + getByDevisId reflète, anti-IDOR create sur devis non possédé → 404, validation nom>100 → 400.
- `2026-06-16 09:34:40Z` **[done]** interventions-mobile L3 router — 4 cas e2e app technicien : 401 sans cookie, getTodayInterventions 200, validation interventionId non positif → 400, start sur intervention inexistante → 404.
- `2026-06-16 10:04:49Z` **[done]** alertes-previsions L3 router — 3 cas e2e : getConfig/saveConfig 401 sans cookie, getConfig+getHistorique 200, saveConfig valide 200 + fréquence hors enum → 400.
- `2026-06-16 10:34:49Z` **[done]** support L3 router — 3 cas e2e contact : 401 sans cookie, 200 valide (emailPort faké), validation message<10 / sujet hors enum / email invalide → 400.
- `2026-06-16 11:04:44Z` **[done]** conseils-ia L3 router — 2 cas e2e (LLM faké) : conseilsIA 401 sans cookie, 200 structure {conseils}. Pattern FakeLlmPort validé pour les routeurs IA.
- `2026-06-16 11:34:50Z` **[done]** assistant L3 router — 3 cas e2e (LLM faké) : getThreads/generateDevis 401 sans cookie, getThreads+suggestRelances 200, generateDevis description vide → 400.
- `2026-06-16 12:04:59Z` **[done]** devis-ia L3 router — 3 cas e2e : list/createAnalyse 401 sans cookie, createAnalyse 200 + getById, validation getById id<=0 → 400 + anti-IDOR addPhoto sur analyse inexistante → 404.
- `2026-06-16 12:34:38Z` **[done]** integrations-comptables L3 router — 3 cas e2e : getConfig 401 sans cookie, 5 lectures 200 (config/exports/syncStatus/syncLogs/pendingItems), saveConfig valide 200 + genererExport logiciel hors enum → 400.
- `2026-06-16 13:04:44Z` **[done]** import-erp L3 router — 3 cas e2e reprise : importClients 401 sans cookie, 200 + crée les clients (mapping colonne→champ), lot > 5000 lignes → 400.
- `2026-06-16 13:35:19Z` **[done]** vitrine L3 — TOUS LES ROUTEURS COUVERTS L3 — 4 cas e2e (public submitContact validation 400 + admin leads 401/200/enum 400). Jalon : 0 routeur tRPC sans test L3 sur tout le new-stack.
- `2026-06-16 14:05:29Z` **[done]** garde-fou couverture routeurs L3 — Scan global it.51 : L1/L2/L3 ÉPUISÉS (0 logique/handler/routeur sans test). Ajout meta-test router-coverage (anti-régression, 2 cas verts). Front suivant : L4/garde-fous/mutation — arbitrage humain conseillé.
- `2026-06-16 14:35:08Z` **[done]** signature-repository-drizzle L2 — Persistance signatures_devis couverte (3 cas : create+défauts, round-trip getByToken/getByDevisId, null si absent). NOUVEAU FRONT : 27 adapters Drizzle L2 sans test (le guard L2 serait rouge → vraies lacunes).
- `2026-06-16 15:04:54Z` **[done]** paiement portal-payment-writer L2 — RLS écriture paiements_stripe couverte (2 cas : insert en_attente scopé artisan du ctx + isolation cross-tenant en lecture B ne voit pas la ligne de A).
- `2026-06-16 15:34:52Z` **[done]** devices device-repository L2 — 3 cas e2e (hors RLS, isolation par user_id) : listByUser trié desc, deleteOwned anti-IDOR (A ne supprime pas l'appareil de B), deleteOthers garde le courant + n'affecte pas B.
- `2026-06-16 15:37:31Z` **[done]** signature signature-context-reader L2 — RLS (4 cas) : getDevisContext round-trip devis+client+artisan sous A, anti-IDOR (B → contexte null), devis inconnu → null, notify scopée tenant + isolation RLS (B ne voit pas la notif de A). Couvre le 2nd reader/writer critique de la signature.
- `2026-06-16 15:38:12Z` **[test]** signature-context-reader L2 (RLS) — it.55 — SignatureContextReaderDrizzle + NotificationWriter sous tenant (4 cas verts) : round-trip contexte devis/client/artisan, anti-IDOR (B->null), notif isolée RLS. Front L2 drizzle : ~23 adapters restants.
- `2026-06-16 16:04:52Z` **[test]** factures contact-readers L2 (RLS) — it.56 — client/devis/artisan readers de la facturation (4 cas verts) : round-trip sous tenant + anti-IDOR cross-tenant (B->null/[]), lignes triées par ordre. Front L2 drizzle : ~20 adapters restants.
- `2026-06-16 16:34:38Z` **[test]** ecritures facture-reader L2 (RLS/FEC) — it.57 — FactureReaderDrizzle (génération FEC) 2 cas verts : getFacture round-trip + anti-IDOR (B->null), getLignes taux/montant TVA scopées via la facture parente (B->[]). Front L2 drizzle : ~19 adapters restants.
- `2026-06-16 17:04:50Z` **[test]** avis flux public L2 (RLS) — it.58 — flux public d'avis client (token), 4 cas verts : context-reader noms sous tenant + anti-IDOR (B->null client/intervention), writer transaction (avis publié + demande completee + notif), isolation RLS (B ne voit pas l'avis de A). Front L2 drizzle : ~18 restants.
- `2026-06-16 17:36:26Z` **[test]** avis demande-repo L2 (RLS) — it.59 — DemandeAvisRepositoryDrizzle 3 cas verts : getInterventionOwned/getClientOwned anti-IDOR (B->null), getDerniereIntervention (date desc), creerDemande scopée artisan. COLONNE AVIS L2 COMPLETE. Front L2 drizzle : ~17 restants.
- `2026-06-16 18:04:37Z` **[test]** commandes artisan-reader L2 (RLS) — it.60 — ArtisanReaderDrizzle (émetteur PDF/email bon de commande) 2 cas verts : getArtisan renvoie la ligne de l'artisan du contexte (A puis B, scope RLS), contexte sans artisan -> null. COLONNE COMMANDES L2 COMPLETE. Front L2 drizzle : ~16 restants.
- `2026-06-16 18:34:42Z` **[test]** articles public-search L2 (hors RLS) — it.61 — PublicArticleSearchReaderDrizzle (catalogue global) 4 cas verts : visible=true + ILIKE nom/description, exclut non-visibles, tri nom asc ; filtres metier/categorie/sousCategorie. Front L2 drizzle : ~15 restants.
- `2026-06-16 19:04:41Z` **[test]** vitrine public-reader L2 — it.62 — VitrinePublicReaderDrizzle 5 cas verts : getArtisanBySlug (hors RLS) + slug inconnu null, getVitrineParams (null sans params), getPublishedAvis (publie only, nom formaté), getPublicStats (interventions terminées only), getArticleCategories (distinctes non nulles). Front L2 drizzle : ~14 restants.
- `2026-06-16 19:34:28Z` **[test]** calendrier ical-public-reader L2 — it.63 — IcalPublicReaderDrizzle 3 cas verts : getFeedByToken résout l'artisan par icalToken (hors RLS) + filtre since + tri asc + enrichissement client ; isolation (feed A sans intervention B) ; token inconnu -> null. Front L2 drizzle : ~13 restants.
- `2026-06-16 20:04:49Z` **[test]** chat client-notifier L2 (RLS+email) — it.64 — ChatClientNotifierDrizzle 4 cas verts : envoi email + lien portail (clé rate-limit chat:artisanId), client sans email -> no-op (pas de check), rate-limit atteint -> no-op, anti-IDOR (client d'un autre tenant -> rien). Front L2 drizzle : ~12 restants.

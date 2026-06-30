# OPE-897 — Prod-readiness : GO/NO-GO argumenté + checklist infra exhaustive

> **Spike lecture seule.** Aucune implémentation. État au **2026-06-30**, branche `staging`
> (= seul env de dev/test ; il n'y a pas d'env local distinct, cf. `CLAUDE.md`).
> Objet : décider si on déploie en **production** aujourd'hui, et fournir la checklist actionnable.

---

## Verdict — **NO-GO conditionnel** (proche du GO)

Le new-stack est **fonctionnellement mûr** (couverture e2e par criticité, smoke vert, RLS
fail-closed, webhook Stripe fail-closed, réconciliation paiement live). Il reste **5 bloquants**
à lever ou à **accepter explicitement comme risque** avant de basculer la prod. Aucun n'est un
chantier lourd ; 3 sont des décisions humaines, 2 sont des merges en cours.

**Règle de décision** : prod **GO** dès que B1+B2 sont mergés/clos et B3+B4 sont **tranchés par
l'humain** (accepter le risque OU planifier la mitigation), puis checklist infra (§B) exécutée.

| # | Bloquant | Type | Statut réel | Verdict |
|---|----------|------|-------------|---------|
| **B1** | Best-effort events billing à atomiser (OPE-890) | Code/atomicité | **In Progress, P1** | 🔴 doit être mergé |
| **B2** | Réconciliation emails reconciler owner-pool (#386) | Code/RLS | en cours (plan) | 🔴 doit être mergé |
| **B3** | Archivage légal 10 ans (OPE-295) | Conformité | OPE-295 « Done » mais **findings ambigus** | 🟠 décision humaine |
| **B4** | Items `Awaiting Human Validation` (872/873/874, 894) | Process/scope | non mergés | 🟠 décision humaine |
| **B5** | Paiements `en_attente` (FAC-00011/14/15/18) | Data/test | artefacts Stripe **test** | 🟢 non-bloquant prod neuve |

---

## (A) GO/NO-GO — argumentaire croisé avec l'état réel

### A.0 — Ce qui est PRÊT (arguments du GO)

- **Isolation tenant fail-closed.** `provision-database.ts` **refuse de démarrer** si le rôle du
  pool runtime peut contourner la RLS (`rolsuper`/`rolbypassrls`) — `apps/api/shared/db/provision-database.ts:39`.
  **73 tables** en `FORCE ROW LEVEL SECURITY` (drizzle). La table racine `artisans` est lue par id
  en création de contexte → **RLS-exempt par conception** (comme `permissions_utilisateur`, cf.
  incident #300/#762) ; les fan-outs cron qui la scannent ne sont donc PAS cassés.
- **Provisioning au boot, sans script manuel.** Runner maison `run-migrations.ts` (Option D, déployé
  prod #228) : `.sql` de `drizzle/` triés par timestamp, ledger `__migrations` (filename + SHA-256),
  sous `pg_advisory_lock`, puis (ré)assure le rôle `app_tenant`. `_journal.json` n'est plus la source
  de vérité runtime.
- **Webhook Stripe fail-closed au bootstrap** (OPE-884, `stripe-webhook-setup.ts`) : idempotent,
  vérifie/crée l'endpoint avec les 7 events nécessaires, **throw** si `STRIPE_SECRET_KEY` présent mais
  Stripe refuse après 3 retries. Renvoie le signing secret **uniquement** à la création d'un nouvel
  endpoint → à capter et poser en env (cf. §B1).
- **Réconciliation paiement live** : poller portail 300s (#382 corrigé round3, poller live OK),
  webhook Stripe fail-closed (OPE-883/884). `maxParamLength: 5000` (`app.ts:482`, régression long-lot
  tRPC couverte par test), cookie d'auth `token`, `x-forwarded-host` privilégié pour `success_url`.
- **Couverture par criticité** : slices L1/L2/L3 (+ L4 navigateur sur chemins critiques) sur portail
  public, signature, paiement, abonnement, auth, facturation, devis (journal
  `docs/testing/journal-tests-manquants.md`). Sweep e2e + mutations rejoués par cron toutes les 5 min,
  alerte ntfy seulement si `issues > 0`.
- **Mentions légales factures** livrées (#378), factures abonnement conformes CGI art. 289 (commit `3864534b`).
- **Self-healing** déployé en filet (Lots 0/1, OPE-885/886) — **pas** une excuse au best-effort
  (cf. B1).

### A.1 — B1 · Events best-effort billing (OPE-890) — 🔴

**Statut réel** : `In Progress, P1`. Le module billing contient encore ~10 `emitOutboxEvent`
hors-tx + `appendEvent` + `.catch` emails (`apps/api/modules/billing/application/billing-use-cases.ts`
lignes 256/287/316/366…). La règle DURE du projet (`CLAUDE.md`, mémoire
`no-best-effort-domain-events`) : tout event de domaine est atomique via `withOutbox` dans la **même
tx** que la mutation. Un event que consomme un downstream (facture émise, cycle payé) **non atomique**
= risque de divergence d'état silencieuse en prod (le self-healing colmate mais c'est un bug à la
source).
**Action** : merger OPE-890 (atomiser tout le billing) **avant** prod. Le reste des domaines a déjà
été câblé via `withOutbox` (OPE-852..868, signature OPE-857, clients OPE-856, etc.).

### A.2 — B2 · Reconciler emails owner-pool (#386) — 🔴

**Statut** : « emails ENCORE à corriger owner-pool, en cours » (plan OPE-897). Classe de bug
**connue et documentée** (mémoire `reconciler-cross-tenant-rls-owner-pool`) : un reconciler qui
découvre cross-tenant sur une table **RLS-FORCE** doit utiliser `getOwnerDbHandle()` ; sous
`app_tenant` sans `SET app.tenant` il voit **0 ligne** → no-op silencieux (false-green en test si
testé en owner). C'est la cause racine du paiement non réconcilié #382/#386.
**Action** : merger le fix owner-pool du reconciler emails **avant** prod, avec test exécuté **sous
`app_tenant`** (jamais owner).

### A.3 — B3 · Archivage légal 10 ans (OPE-295) — 🟠 décision humaine

**Statut** : OPE-295 marquée **« Done »** mais le **dernier commentaire (27/06)** et
`docs/architecture/ope-295-archivage-superpdp-findings.md` concluent que **SuperPDP ne clarifie pas
publiquement** s'il archive à **valeur probante 10 ans** (service distinct de la génération
Factur-X/PDF-A3). **Incohérence statut Linear ↔ findings** : le « Done » ne reflète pas une
résolution conforme prouvée.

**Cadre légal** (sources §C) : conservation **10 ans (comptable, Code de commerce art. L123-22 /
L123-28-1)** et **6 ans (fiscal, art. L102 B LPF)** ; obligation **dès aujourd'hui** pour toute
facture, pas seulement à l'entrée en vigueur de l'e-invoicing B2B (réforme 2026/2027). La valeur
probante exige un **archivage avec horodatage + piste d'audit fiable** (NF Z42-013 idéalement).

**Risque** : si SuperPDP n'archive pas 10 ans, **notre responsabilité**. Les factures sont stockées
en PG mais ce n'est **pas** un archivage à valeur probante.

**Décision attendue (humain)** — une des trois :
- **Accepter le risque** au lancement (factures B2C, volume initial faible) + ouvrir le suivi SAE.
- **Bloquer** jusqu'à confirmation écrite SuperPDP (scénario A des findings).
- **Mitiger en parallèle** : intégrer un **SAE tiers** (ADSN recommandé, 0,01 €/doc, plan
  `docs/architecture/ope-295-sae-integration-plan.md`, abstraction `ArchivagePort` non-bloquante).

### A.4 — B4 · Items `Awaiting Human Validation` non mergés — 🟠

Présents en statut `Awaiting Human Validation` (à statuer avant ou après prod) :
- **OPE-874** — webhook billing-saas crée la facture si le cycle n'est pas déjà `paid` (P2). Impacte
  la **collecte de revenu Operioz** sur ses propres abonnés. À trancher : bloquant revenu ou post-launch ?
- **OPE-872** — email à l'artisan à l'émission d'une facture d'abonnement (P2). Confort, non bloquant.
- **OPE-873** — Factur-X B2B billing-saas (`buyer_siren`) — aligné réforme 2026/2027, **non bloquant
  aujourd'hui**.
- **OPE-894** — backfill self-healing des permissions (SPIKE, Backlog, P1) : nouveau code de
  permission → défaut par rôle pour users **existants**. **Non bloquant pour une prod neuve** (aucun
  user existant), mais à livrer avant le 1er ajout de permission post-launch.

Rappel `CLAUDE.md` : le reviewer **ne merge pas** une catégorie risquée (billing/argent) sans trace
de validation humaine. Ces items restent en attente tant que l'humain n'a pas dit « go ».

### A.5 — B5 · Paiements `en_attente` (FAC-00011/14/15/18) — 🟢

Le poller les a **laissés volontairement** car Stripe **test** ne les marque pas `paid`. Ce sont des
**artefacts de l'env test/staging**, pas un bug. Une prod neuve part d'une base vierge (ou seed
contrôlé) ; en mode **live** la réconciliation reflétera le vrai statut Stripe. **Action** :
vérifier qu'ils ne sont pas migrés vers la prod (base prod vierge) + smoke d'un paiement live réel.

### A.6 — Sécu / authz / RLS — ✅ (avec les réserves B1/B2)

- RLS `FORCE` sur les 73 tables tenant ; owner-bypass impossible au runtime (fail-closed boot).
- Aucune table lue **pré-tenant** sous RLS tenant (leçon #300/#762 : `permissions_utilisateur` et
  `events` RLS-exempt/désactivée avec filtre explicite + test isolation).
- Tests de gate permission à recréer en **membre non-owner** (sinon owner bypasse → false-green, OPE-674).

---

## (B) Checklist infra PROD — exhaustive et actionnable

> Convention projet : **jamais** de valeur d'env runtime dans `.env.production` commité. Secrets =
> **env Docker/serveur** (backend) ou **`wrangler pages secret put`** (CF Pages). `.env.production` =
> constantes publiques non-sensibles uniquement (titre app, logo).

### B1 — Stripe **LIVE** (argent — porte de validation)

- [ ] **Backend** : `STRIPE_SECRET_KEY` `sk_test_…` → **`sk_live_…`** (env Docker/serveur prod).
      Réutiliser le compte Stripe legacy (mémoire `refonte-legacy-secrets-reuse`) — pas de nouveau compte.
- [ ] **Frontend** : `VITE_STRIPE_PUBLISHABLE_KEY` `pk_live_…` → **build-time** sur le projet **CF
      Pages PROD** : `wrangler pages secret put VITE_STRIPE_PUBLISHABLE_KEY --project-name <projet-prod>`
      (sinon la clé est vide dans le bundle, cf. `CLAUDE.md`).
- [ ] **Deux webhooks — bootstrap 2 temps, FAIL-CLOSED** (les deux sont obligatoires) :

      `stripe-webhook-setup.ts` s'exécute dans le hook `onReady` (`app.ts`) et crée les deux endpoints
      de façon **idempotente** : si l'endpoint existe déjà → renvoie `null` → pas de throw.
      Si un **nouvel** endpoint est créé et que le secret env correspondant ne correspond pas → **throw**
      (l'app refuse de démarrer).

      **Endpoint 1 — `/api/stripe/webhook` → `STRIPE_WEBHOOK_SECRET`**
      - 7 events : `checkout.session.completed`, `customer.subscription.{created,updated,deleted,trial_will_end}`,
        `payment_intent.{succeeded,payment_failed}`
      - 1er boot → endpoint créé → secret logué en `warn` (`whsec_…`) → throw si `STRIPE_WEBHOOK_SECRET` absent/différent.
      - Capter le secret dans les logs → poser en `STRIPE_WEBHOOK_SECRET` (env serveur prod, **jamais `.env.production` commité**) → redéployer.

      **Endpoint 2 — `/api/stripe/connect-webhook` → `STRIPE_CONNECT_WEBHOOK_SECRET`** (`connect=true`)
      - 2 events : `account.updated`, `account.application.deauthorized`
      - Même procédure : 1er boot → endpoint créé avec flag `connect=true` → secret logué → throw si `STRIPE_CONNECT_WEBHOOK_SECRET` absent/différent.
      - Capter → poser en `STRIPE_CONNECT_WEBHOOK_SECRET` → redéployer.

      Précédent staging : endpoint Connect créé manuellement via API Stripe Dashboard + secret posé dans `.env.staging`.
      En prod : le bootstrap auto gère les deux de la même façon.

      ⚠️ Les deux throws sont indépendants — si l'un des secrets manque, l'app ne démarre pas.
- [ ] **Smoke paiement live réel** (carte réelle faible montant ou Stripe live test) → facture passe
      `payée`, puis vérifier la réconciliation (poller 300s) sur un paiement non-webhook.

### B2 — DNS / domaines / edge

- [ ] **DNS prod** `operioz.com` (+ `www`, sous-domaines app/portail) chez le registrar → CF.
- [ ] **CF Pages projet PROD** distinct de `artisan-staging`, branche de prod, variables `VITE_*`
      build-time posées (Stripe pk, et toute autre `VITE_*` requise).
- [ ] **CF Tunnel backend PROD** (domaine `api`/`backend.operioz.com`) → conteneur Docker prod.
- [ ] **Dispatcher Pages** : conserve/pose `x-forwarded-host` + `x-forwarded-proto` (hôte public) —
      sinon `success_url` Stripe bâti sur l'hôte interne → 404 post-paiement (incident connu).
- [ ] Vérifier `APP_URL` runtime = domaine **public** prod (utilisé pour `success_url`, liens portail/email).
- [ ] `maxParamLength: 5000` déjà en code (`app.ts:482`) — pas d'action, juste vérifier au smoke
      qu'un **long lot tRPC** réel ne 404 pas via l'edge.

### B3 — Base de données PROD (PostgreSQL)

- [ ] **Deux rôles, deux URLs** (jamais croisées) :
      - `DATABASE_URL` = `artisan_user` (owner) → provision au boot (migrations + grants). Connexion **éphémère**.
      - `APP_DATABASE_URL` = `app_tenant` (**non-superuser, non-bypassrls**) → pool runtime RLS.
- [ ] Vérifier le **fail-closed** au boot prod : le serveur **refuse de démarrer** si `app_tenant`
      est super/bypassrls (`provision-database.ts:39`). Tester volontairement une mauvaise URL = boot refusé.
- [ ] Provisioning automatique au boot : migrations `drizzle/` + RLS + role guard. **Ne jamais**
      appliquer à la main (`drizzle-kit migrate`/`psql`). Vérifier le ledger `__migrations` après 1er boot.
- [ ] **🔴 SAUVEGARDES + DR** (absent du new-stack — à mettre en place) :
      - `pg_dump` quotidien chiffré hors-serveur (rétention ≥ 30 j) **OU** PITR (WAL archiving / base
        managée).
      - **Tester une restauration** avant le go-live (un backup non restauré n'existe pas).
      - Documenter RPO/RTO cibles. Cohérent avec l'obligation d'archivage 10 ans (B3 §A.3 / conformité).
- [ ] Base prod **vierge** (ou seed contrôlé) — ne PAS importer les FAC en_attente de staging (B5).

### B4 — Secrets & configuration

- [ ] Tous les secrets en **env Docker/serveur** (backend) / **wrangler pages secret** (front).
      Audit : `grep` de toute valeur sensible dans `.env.production` commité = 0 (règle DURE).
- [ ] Réutiliser secrets legacy : **Stripe, Gemini (LLM), secret d'auth/JWT** (format identique au
      backend legacy, mémoire `refonte-legacy-secrets-reuse`).
- [ ] Vérifier la présence de **tous** les env runtime requis avant boot : un
      `${VAR:?}` obligatoire manquant dans `docker-compose` **casse toute commande compose** (deploy
      inclus) — mémoire `compose-required-var-couples-stack`.
- [ ] Rotation/segregation : clés **prod ≠ staging** (Stripe surtout). Pas de clé test en prod.

### B5 — Env runtime applicatif

- [ ] `APP_URL` / hôte public (Stripe `success_url`, liens email/portail).
- [ ] Cookie d'auth = **`token`** (host-only) — vérifier domaine/secure/sameSite en prod.
- [ ] `x-forwarded-host` / `x-forwarded-proto` privilégiés (cf. B2).
- [ ] `maxParamLength: 5000` (déjà en code).
- [ ] `STRIPE_*`, `DATABASE_URL`, `APP_DATABASE_URL`, secret auth, clé LLM tracée (règle
      `require-llm-tracking`).

### B6 — Résilience / runtime serveur

- [ ] **OOM** : borner le parallélisme (crash global 29/06 = 84 process node / 22.8 GB). En prod, pas
      de fleet d'agents — mais garder **swap dimensionné** (fstab persistant) et limites mémoire Docker.
- [ ] **Rootless Docker survie reboot** : `linger` activé + `restart: unless-stopped` + (drop-in
      patient-restart si boltdb lent) — mémoire `rootless-docker-boltdb-crashloop`.
- [ ] `deploy-backend.sh` : build depuis **`origin/staging`** (réaligner, pas le working tree partagé
      périmé) — pour la prod, builder depuis le **ref prod figé/taggé**, pas un tree détaché.
- [ ] Healthcheck conteneur + auto-restart ; `/health` exposé (smoke deploy l'utilise déjà).

### B7 — Observabilité

- [ ] **Niveau de log prod** : si `level ≥ warn`, attention aux events `info` filtrés (le plan le
      signale) — garder au moins `info` sur les chemins argent/auth/réconciliation, ou tracer en `warn`.
- [ ] **Réconciliation** : poller paiement 300s actif ; alerter (ntfy) si anomalies persistantes.
- [ ] **Sweep e2e + mutations** : porter le cron 5 min vers les **URLs prod** (les deux scripts :
      `staging-e2e-sweep.mjs` ET `staging-e2e-mutations.mjs`), credentials d'un compte de test prod
      dédié. Alerte ntfy si `issues > 0`.
- [ ] **Healing events** : surveiller `healing.*` récurrents = bug à la source (pas un état normal).
- [ ] Métriques basiques : erreurs 4xx/5xx, latence, taux webhook rejetés.

### B8 — Conformité

- [ ] **RGPD** : rétention/purge (cron `retentionPurgeCronPlugin` déjà câblé `app.ts:1396`),
      consentement, anonymisation client (events `clients.anonymiser` OPE-856). Vérifier mentions
      légales / politique de confidentialité publiées.
- [ ] **E-invoicing** : PDP **SuperPDP** (PA choisie OPE-283) ; Factur-X/PDF-A3 générés ; gate
      d'activation sans connexion SuperPDP en place (OPE-882). B2B Factur-X = réforme 2026/2027 (non
      bloquant aujourd'hui).
- [ ] **Mentions légales factures** : livrées (#378), conformes CGI art. 289 / abonnement art. 289.
- [ ] **🟠 Archivage 10 ans** (B3/§A.3) : trancher SuperPDP conforme / SAE tiers / risque accepté.
      **Lié aux sauvegardes DB** (un backup ≠ archivage probant, mais c'est le minimum).

### B9 — Go-live (ordre d'exécution)

1. Lever B1 (OPE-890) + B2 (#386) → mergés sur `staging`, gate vert.
2. Trancher B3 (archivage) + B4 (AHV billing) — décision humaine tracée.
3. Provisionner infra prod : DB (2 rôles/URLs + backups testés), CF Pages prod, CF Tunnel,
   DNS, secrets (B3/B4/B6/B7).
4. 1er boot prod → capter **`STRIPE_WEBHOOK_SECRET`** ET **`STRIPE_CONNECT_WEBHOOK_SECRET`** dans les logs → poser les deux en env prod → redéployer (B1).
5. Smokes : `/health`, auth, **paiement live réel**, long-lot tRPC via edge, portail public.
6. Sweep + mutations e2e contre prod → `issues: 0`.
7. Bascule DNS / annonce.

---

## (C) Sources web (consultées 2026-06-30)

- **Stripe — API keys & webhooks (test→live)** : un signing secret **distinct par endpoint et par
  mode** ; live-mode keys séparées ; webhooks live à recréer/pointer vers l'URL prod.
  <https://docs.stripe.com/keys> · <https://docs.stripe.com/webhooks> ·
  <https://www.sendowl.com/blog/tips-and-advice/stripe-test-mode-going-live>
- **Production-readiness checklists SaaS 2025** (sécurité/authz, monitoring/observabilité, incident
  response, backups/DR, ownership) :
  <https://goreplay.org/blog/production-readiness-checklist-20250808133113/> ·
  <https://getdx.com/blog/production-readiness-checklist/> ·
  <https://www.opslevel.com/resources/production-readiness-in-depth>
- **PostgreSQL RLS multi-tenant** : superusers et rôles `BYPASSRLS` contournent toujours la RLS ; les
  owners de table la contournent par défaut → le rôle runtime doit être **non-superuser, non-owner,
  FORCE RLS** (exactement le design `app_tenant`).
  <https://www.postgresql.org/docs/current/ddl-rowsecurity.html> ·
  <https://www.thenile.dev/blog/multi-tenant-rls>
- **Archivage facture électronique FR — 10 ans valeur probante** : Code de commerce art. L123-22
  (10 ans comptable) + art. L102 B LPF (6 ans fiscal) ; obligation actuelle, indépendante de l'entrée
  en vigueur 2026/2027.
  <https://www.pennylane.com/fr/fiches-pratiques/facture-electronique/archivage-des-factures-electroniques> ·
  <https://www.indy.fr/guide/facturation/electronique/archiver/>

---

## Annexe — références internes

- `CLAUDE.md` (conventions, déploiement, secrets, RLS, events atomiques)
- `docs/architecture/ope-295-archivage-superpdp-findings.md` + `…-sae-integration-plan.md`
- `docs/architecture/ope-879-self-healing-proposal.md`, `events-domaine-atomique.md`,
  `migration-runner-option-d.md`
- `docs/testing/journal-tests-manquants.md` (couverture par criticité)
- Code : `apps/api/shared/db/provision-database.ts` (fail-closed RLS),
  `apps/api/shared/infra/stripe-webhook-setup.ts` (webhook bootstrap),
  `apps/api/app.ts:482` (maxParamLength), `apps/api/modules/billing/application/billing-use-cases.ts`
  (best-effort à atomiser — OPE-890)
- Issues : OPE-890 (B1), #386 (B2), OPE-295 (B3), OPE-872/873/874/894 (B4)

Tu es un architecte QA / testing senior. Ta mission est un **spike** : proposer l'approche comprehensive de testing à mettre en place pour l'ERP Operioz, couvrant chaque fonctionnalité à tous les niveaux (unitaire, intégration, e2e navigateur, et autres approches). Tu ne réécris PAS toute la suite : tu produis une proposition argumentée + un PoC minimal + la liste des chantiers d'implémentation à créer ensuite.

**Issue Linear** : OPE-316 — [Spike] Proposer l'approche comprehensive de testing
**Projet** : Infra de testing top-notch

Le projet est dans `/home/developer/artisan-mvp-temp`. Cible : le **new-stack** (`src/`).

## État des lieux à intégrer (point de départ — vérifie-le dans le code)

- **Unit / intégration** : Vitest (`src/**/*.test.ts`), ~2150 cas, **fakes manuels par port** (zéro `vi.mock`), e2e Postgres jetable avec RLS (`withTenant`). Config : `vitest.config.ts`.
- **e2e navigateur** : **Playwright** en Docker via `scripts/pw-run.sh` (image `mcr.microsoft.com/playwright:v1.48.0-jammy`), balayage de routes `scripts/staging-e2e-sweep.mjs`, **cron 5 min** + alerte ntfy. Détails dans `CLAUDE.md` (section « Déboguer un problème front/intégration »). ⚠️ Le setup réel est **Playwright**, pas Puppeteer — clarifie la terminologie dans ton doc.
- **Smoke** : ~35 scripts `scripts/test-*-pg.mjs` ad hoc, non structurés en suite.
- **CI** : un seul workflow `.github/workflows/ci.yml`.

Lis réellement ces fichiers/scripts + un échantillon de tests existants (un use-case test, un repo drizzle test, un router e2e test) pour ancrer ta proposition dans le réel.

## Travail attendu

### 1. Cartographie & gaps
- Couverture actuelle par couche (domain/application/infra/interface) et par domaine (`src/modules/*`).
- Trous : fonctionnalités sans e2e navigateur ; chemins critiques (facturation, paiement Stripe, signature devis, portail client public, onboarding) sans couverture bout-en-bout.
- Sort des ~35 scripts `test-*-pg.mjs` : convertir en suite structurée ? supprimer ? documenter ?

### 2. Pyramide de test cible
Pour **chaque fonctionnalité**, définir les niveaux attendus + conventions :
- **Unitaire** : use-cases purs / domaine (Vitest + fakes) — formaliser "1 use-case = 1 test".
- **Intégration** : repo Drizzle + RLS sur Postgres jetable — formaliser le harness commun (création DB, rôle `app_tenant`, plages d'ids uniques par fichier).
- **e2e navigateur** : suite **Playwright structurée par fonctionnalité** (pas seulement un sweep de routes) avec parcours réels (login, devis→facture→paiement, signature, portail public).
- **Données de test** : factories/builders standardisés remplaçant les scripts de seed ad hoc.

### 3. Autres approches à évaluer (output clé du spike)
Pour chacune : recommandation OUI/NON + justification + coût/valeur :
- Contract testing (tRPC/zod ↔ client)
- Charge / perf (lien projet « Optimiser la vitesse et la latence »)
- Régression visuelle (screenshots Playwright)
- Mutation testing (qualité réelle des assertions — utile vu le passé de tests tautologiques legacy)
- Accessibilité (axe-core via Playwright)
- Smoke / synthetic monitoring (généraliser le cron sweep)
- Sécurité automatisée (compléter les audits IDOR/RLS)

### 4. Intégration CI/CD & DX
- Matrice d'exécution : pré-commit / PR / nightly, par couche.
- Gating : couverture minimale, e2e bloquants sur chemins critiques.
- Parallélisation & feedback (lien projet « dev parallèle / worktrees » : e2e isolés par worktree, ports/DB/navigateurs dédiés).
- Reporting : couverture, flaky tests.

### 5. PoC minimal
Implémente UNE suite Playwright structurée pour **1 fonctionnalité critique bout-en-bout** (ex. devis → signature → facture → paiement), exécutable via `scripts/pw-run.sh`, comme preuve du modèle cible. Garde-le réaliste et fonctionnel.

## Livrables

1. Document `docs/testing/strategie-testing-comprehensive.md` : état des lieux, pyramide cible, approches retenues/rejetées (justifiées), intégration CI, plan de déploiement par phases.
2. PoC Playwright d'une fonctionnalité critique (+ commandes pour le rejouer).
3. **Liste des chantiers d'implémentation à créer** en sortie (titres + objectif court) — ils deviendront les prochaines issues du projet.

## Méthode

- Base-toi sur le CODE RÉEL ; cite les chemins. Sois honnête sur ce qui marche déjà (ne réécris pas l'existant solide : Vitest + fakes + e2e PG RLS).
- Le gros de la valeur est côté **e2e navigateur structuré** et **autres approches** — c'est là qu'il faut creuser.
- N'installe pas de dépendances lourdes sans le justifier ; privilégie ce qui s'intègre au setup Docker/Playwright existant.

## Fin de mission

Poste un commentaire sur OPE-316 (Linear) résumant la recommandation + le lien vers le document + la liste des chantiers d'implémentation proposés.

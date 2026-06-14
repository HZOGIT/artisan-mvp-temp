# OPE-184 — Plan de migration détaillé & découpage Linear

> Complément opérationnel de `ope-184-proposition-stack-cible.md`.
> Objectif : un plan exécutable, découpé en tâches **traitables en < 20 min par une session Claude Code**.
> Convention : chaque tâche est **autonome, testable, et réversible**. Une tâche ne casse jamais le build (`tsc --noEmit` + tests verts à la fin).

## Principe de découpage

- **Phase 0 (Socle)** : travail **unique et fondateur** → découpé finement en issues individuelles (< 20 min).
- **Phases 1→5 (domaines)** : travail **répétitif** suivant une **recette identique** par domaine.
  - Le **domaine pilote (`vehicules`)** est éclaté en issues individuelles : il sert de **gabarit de référence**.
  - Les autres domaines = **1 issue-epic chacun** portant la **checklist granulaire** (chaque ligne = une tâche < 20 min) + ses spécificités métier.

## Recette par domaine (la checklist de chaque epic des phases 1→5)

Chaque case ci-dessous = une tâche < 20 min :

1. Scaffold `src/modules/<domaine>/` (`domain/`, `application/`, `infra/`, `interface/`) + `<domaine>.module.ts` (wiring DI).
2. Définir le **port** `I<Domaine>Repository` (interface) — chaque méthode **exige le `TenantContext`** dans sa signature.
3. Implémenter le **repository Drizzle** (filtre `artisanId` systématique + `withTenant()` RLS).
4. Use-case **lecture** : `list` / `getById` (avec refus cross-tenant).
5. Use-case **create** (valider les FK entrantes, ex. `clientId`, contre le tenant).
6. Use-case **update**.
7. Use-case **delete** (gérer les cascades).
8. Extraire la **logique métier spécifique** du domaine en use-case(s) testé(s) (cf. « Spécificités » de l'epic).
9. **Routeur tRPC** `<domaine>` : transport mince → appelle les use-cases (aucune logique).
10. **Tests unitaires** des use-cases (repository mocké).
11. **Tests d'intégration** repository sur Postgres jetable (Testcontainers).
12. Brancher la **suite d'isolation cross-tenant** sur toutes les routes « par id ».
13. **Câbler le gateway** : préfixe tRPC `<domaine>.*` routé vers le nouveau stack derrière un flag (off par défaut).
14. **Canary** : activer le flag pour 1-2 tenants + **comparaison shadow** ancien/nouveau.
15. **Bascule 100 %** (flag on global) une fois les critères §3.4 verts ; **retrait du code legacy** après 2-4 semaines de stabilité.

**Critères de bascule (rappel)** : parité fonctionnelle, isolation 100 % + RLS actif, tests verts en CI, canary shadow sans écart, p95 ≤ ancien, observabilité en place. **Rollback** = flip du flag `on→off` (instantané, DB partagée).

---

## Phase 0 — Socle (issues individuelles)

> **Bloquant pour tout le reste.** Livre le filet (RLS + harnais isolation + CI) et la bascule DB.

| # | Tâche | Sortie attendue |
|---|---|---|
| 0.1 | **Spike** : table de correspondance des types MySQL→PG | doc : chaque type de colonne de `schema.ts` → équivalent PG + pièges (autoincrement→identity, datetime→timestamptz, tinyint(1)→boolean, enum, `ON UPDATE`) |
| 0.2 | Ajouter `pg` + `drizzle-orm/node-postgres`, service **Postgres** au `docker-compose` (dev), dialect `pg` dans `drizzle.config.ts` | DB PG démarrable en local |
| 0.3 | Convertir le schéma Drizzle → `pgTable` **batch 1** (plateforme + cœur facturation : users, artisans, clients, devis*, factures*, articles*) | `schema.ts` compile en `pg` pour ce batch |
| 0.4 | Conversion schéma **batch 2** (comptabilité, prévisions, terrain : interventions*, chantiers*, techniciens*, vehicules*) | idem |
| 0.5 | Conversion schéma **batch 3** (achats/stock, relation client, IA, plateforme restante) | `schema.ts` 100 % `pgTable` |
| 0.6 | Régénérer la **baseline migration** Drizzle pour PG (`drizzle-kit generate`) + vérifier le diff SQL | `0000_baseline_pg.sql` cohérent |
| 0.7 | Repointer `getDb()`/pool sur `node-postgres` + corriger les requêtes `sql\`\`` MySQL-spécifiques de `db.ts` | app boot sur PG |
| 0.8 | Script de **copie de données** MySQL→PG (pgloader OU script node ETL) + recalage des séquences | données migrables de façon reproductible |
| 0.9 | Config **Vitest sur Postgres jetable** (Testcontainers) + faire passer le 1er groupe de tests | tests d'isolation verts sur PG |
| 0.10 | **`TenantContext`** (shared kernel) : type + extraction depuis le JWT (réutilise `auth-simple`) | `src/shared/tenant/` |
| 0.11 | Helper **`withTenant()`** : `set_config('app.tenant', …)` par transaction + intégration au client Drizzle | scoping RLS activable |
| 0.12 | Migration **RLS** : `ENABLE ROW LEVEL SECURITY` + policies `artisan_id = current_setting('app.tenant')` sur les tables tenant | RLS actif (défense en profondeur IDOR) |
| 0.13 | **Ports d'effets de bord** : interfaces `EmailPort`, `SmsPort`, `StoragePort`, `PdfPort` (+ impl adaptant l'existant) | effets de bord mockables |
| 0.14 | **CI** GitHub Actions #1 : `lint` (prettier --check) + `typecheck` (`tsc --noEmit`) | gate qualité |
| 0.15 | **CI** GitHub Actions #2 : `vitest` avec service Postgres | gate tests |
| 0.16 | **Sortir les migrations du boot** conteneur → étape `deploy` dédiée (Taskfile/compose) | migrate ≠ run |
| 0.17 | **Gateway** : router par préfixe tRPC selon un flag dans le proxy Cloudflare (`functions/api/[[path]].js`) | aiguillage ancien/nouveau |
| 0.18 | **Scaffold Fastify** : `src/app.ts` + adapter tRPC + `/health` (squelette vide, déployable) | nouveau stack bootable |
| 0.19 | **Mécanisme de feature flags** (table config ou env) lu par le gateway, granularité par tenant | canary possible |
| 0.20 | **Harnais d'isolation cross-tenant** paramétrable (généralise `isolation-multi-tenant.test.ts`) | 1 helper réutilisé par tous les domaines |
| QW | **Quick win** : supprimer les deps mortes (`lucia`, `@lucia-auth/adapter-mysql`, doublon `bcrypt`) | `package.json` nettoyé |

---

## Phases 1→5 — domaines (epics à checklist)

Ordre = §3.3 de la proposition (risque × valeur × couplage).

- **Phase 1 — Pilotes** : `vehicules` *(éclaté en issues, gabarit)*, `badges/techniciens`, `support`, `avis`, `geolocalisation`.
- **Phase 2 — Référentiels** : `clients`, `articles/bibliotheque`, `fournisseurs`, `stocks`, `parametres`.
- **Phase 3 — Cœur transactionnel** : `devis`, `factures`, `contrats`, `comptabilite`, `commandes-fournisseurs`.
- **Phase 4 — Terrain & temps réel** : `interventions`, `chantiers`, `rdv-calendrier`, `notifications-push`, `assistant-ia` (SSE).
- **Phase 5 — Plateforme & bascule** : `stripe-abonnement`, `utilisateurs-permissions`, `auth + révocation session`, `scheduler` (job idempotent), `extinction de l'ancien stack`.

### Spécificités métier à ne pas perdre (par domaine sensible)

- **vehicules** : `delete` en cascade (kilométrage/entretiens/assurances) → ownership impératif (IDOR connu).
- **clients** : FK `clientId` validée à la création partout (vecteur de dump PII cross-tenant).
- **devis** : immutabilité post-signature, numérotation, options/lignes, relances.
- **factures** : numérotation séquentielle sans trou, anti double-billing (récurrentes/contrats), TVA multi-taux, paiement partiel.
- **comptabilite** : exports FEC / Factur-X, génération d'écritures TVA, plan comptable.
- **assistant-ia** : SSE + outils Gemini + rate-limit + permissions (bypass connu).
- **auth** : conserver l'émission JWT jusqu'à la fin ; ajouter la **révocation** (table `sessions`) à la bascule.
- **scheduler** : rendre chaque job **idempotent**, isolé du process web.

---

## Estimation (rappel, ordres de grandeur, 1-2 devs)

| Phase | Durée |
|---|---|
| 0 — Socle | 4-6 sem. |
| 1 — Pilotes | 3-4 sem. |
| 2 — Référentiels | 3-4 sem. |
| 3 — Cœur transactionnel | 6-9 sem. |
| 4 — Terrain & temps réel | 4-6 sem. |
| 5 — Plateforme & bascule | 3-5 sem. |
| **Total** | **~23-34 sem.** |

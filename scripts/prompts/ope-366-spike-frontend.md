Tu es un architecte frontend senior (React/TypeScript), spécialiste des stacks modernes type-safe et des migrations progressives. Ta mission est un **spike** : proposer une nouvelle stack frontend top-notch pour l'ERP Operioz + la stratégie de migration progressive, en t'appuyant sur une analyse réelle de la codebase.

**Issue Linear** : OPE-366 — [Spike] Proposer la nouvelle stack frontend + stratégie de migration progressive
**Projet** : Refonte progressive du frontend (clean archi + REST)

Le projet est dans `/home/developer/artisan-mvp-temp`. Le frontend est dans `client/`.

## Contraintes imposées (non négociables)

- **On reste sur Vite.js**.
- **Clean architecture** côté front (domaine / application / infra-web / UI), à l'image du backend (`src/modules/*`).
- **Migration progressive (strangler)** : réécriture **page par page** ; legacy et moderne cohabitent jusqu'au remplacement complet du legacy.
- **Bascule REST** : on enrichit le backend pour exposer ses API en **REST** (en parallèle de tRPC), et le nouveau front appelle les **endpoints REST**.
- **Client auto-généré** via **openapi-typescript** (types depuis le schéma OpenAPI) + couche de requêtes typée.
- **Audit de chaque lib** : critiquer, moderniser, dédupliquer, supprimer le code/dépendances morts.
- Cible : **type-safe end-to-end, le moins de bugs possible**.

## Étape 0 — Analyse réelle de la codebase

Lis vraiment le code, cite les chemins :
- `package.json` (toutes les deps front) ; `vite.config.ts` ; `tsconfig*.json` ; config Tailwind/ESLint.
- Structure `client/src/` : `_core`, `app`, `domain`, `infra-web`, `hooks`, `lib`, `pages` (~91 pages), `components`, `contexts`. Comprends les conventions actuelles.
- Comment le front parle au backend aujourd'hui : tRPC client (`@trpc/react-query`), axios, superjson. Où, comment.
- Routing actuel (`wouter`) : montage des routes, layout, auth guards.
- Confirme les redondances/morts suspectés : **axios + tRPC** (2 couches HTTP), **recharts + chart.js** (2 libs charts), **`@clerk/clerk-react` alors que l'auth est JWT cookie/jose** (dépendance morte ? cf. audits `docs/audits/*clerk*`).
- Côté backend : repère les schémas zod des routeurs tRPC (`src/modules/*/interface/trpc/*.router.ts`) — c'est la source pour générer l'OpenAPI.

## Étape 1 — Audit des libs (tableau)

Pour CHAQUE dépendance front : **garder / remplacer / supprimer** + justification (version, maintenance, redondance, poids bundle, sécurité, alternative). Mets en évidence le mort et les doublons.

## Étape 2 — Stack cible (concret ET ambitieux — « surprends-moi »)

Recommande une techno précise par brique, en justifiant (valeur vs poids/maintenance) :
- **Routing** : évalue **TanStack Router** (type-safe, search params typés) vs alternatives. Recommande.
- **Data layer** : **TanStack Query** (déjà là) + client REST généré par **openapi-typescript** — montre le flux concret avec `openapi-fetch` + `openapi-react-query` (hooks typés par endpoint). Exemples de code.
- **State** : délimite serveur (Query) vs UI (Zustand/Jotai/nuqs pour l'URL ? context ?).
- **Formulaires + validation** : react-hook-form+zod conservés vs **TanStack Form** — tranche.
- **UI/design system** : Radix + Tailwind conservés ? formaliser des primitives (shadcn/ui) ? tokens de design.
- **Tables/data-grid** (TanStack Table ?), **charts** (trancher recharts vs autre), **dates**, **i18n**, **thèmes**, **animations**.
- **Qualité/anti-bug** : TS strict (+ `noUncheckedIndexedAccess`…), **Biome** vs ESLint+Prettier, tests (Vitest + Testing Library), e2e (Playwright — déjà en place, cf. `CLAUDE.md` + `scripts/pw-run.sh`), error boundaries, suspense, perf (code-splitting par route).

## Étape 3 — Bascule REST + client auto-généré

- Comment **exposer du REST côté backend** en parallèle de tRPC sans dupliquer la logique : ex. générer l'OpenAPI **depuis les schémas zod existants** (`@fastify/swagger` + `fastify-zod-openapi` / `zod-to-openapi`), en réutilisant les use-cases. Montre le principe.
- Pipeline **openapi-typescript** : génération des types + client typé, intégration au build/CI, regénération auto, DX.
- Convention : hooks Query générés par domaine, gestion auth (cookie `token`), erreurs, pagination.

## Étape 4 — Stratégie de migration progressive (strangler)

- Cohabitation legacy (wouter/tRPC) ↔ moderne (nouveau routeur/REST) dans la **même app Vite** : montage par route / sous-arbre / feature flag. Schéma concret.
- Ordre de réécriture des ~91 pages (par risque / valeur / dépendances) — propose une première vague.
- Critères de bascule + rollback par page.
- **Structure clean-archi cible** détaillée (arborescence de dossiers + rôle de chaque couche, parité avec le backend).

## Étape 5 — PoC minimal

Réécris **1 page simple** sur la stack cible, consommant un **endpoint REST réel** via le client openapi-typescript, en clean archi, cohabitant avec le legacy. Si l'endpoint REST n'existe pas encore, crée-en un minimal côté backend (exposant un use-case existant) pour démontrer le flux bout-en-bout. Documente les commandes pour le rejouer.

## Livrables

1. Document `docs/frontend/refonte-stack-proposition.md` : état des lieux, audit des libs (tableau), stack cible justifiée, bascule REST/openapi, stratégie de migration, structure clean-archi, plan par phases.
2. PoC d'une page (+ endpoint REST si besoin) + commandes.
3. Liste des **chantiers d'implémentation à créer** en sortie (titres + objectif court).

## Fin de mission — IMPORTANT

Poste le **livrable de synthèse en COMMENTAIRE sur l'issue OPE-366** dans Linear (c'est explicitement demandé). Le commentaire doit contenir :
- Résumé exécutif de la stack retenue (par brique, en une ligne chacune).
- Le **tableau d'audit des libs** (garder / remplacer / supprimer).
- Le schéma de bascule REST + openapi-typescript en quelques lignes.
- Le plan de migration progressive (phases + première vague de pages).
- Le lien vers `docs/frontend/refonte-stack-proposition.md`.
- La liste des chantiers d'implémentation proposés.

Sois concret (technos nommées, versions, extraits de code), honnête sur les coûts, et capitalise sur ce qui marche déjà (React 19 / Vite / Tailwind / TanStack Query). Ne réécris pas l'existant solide ; cible les redondances et le legacy.

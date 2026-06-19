Tu es un architecte senior chargé de produire une analyse complète de la stack actuelle du projet Operioz et une proposition d'architecture cible.

**Issue Linear** : OPE-184 — Analyse de la stack actuelle et proposition d'architecture cible
**Projet** : Refonte progressive de la stack et de l'architecture

## Mission

Explore le codebase `/home/developer/artisan-mvp-temp` en profondeur et produis un document de proposition `docs/architecture/ope-184-proposition-stack-cible.md`.

## Étape 1 — Audit de la stack actuelle

Analyse le projet pour cartographier :
- Framework(s) backend utilisé(s), version, patterns
- Base de données : type, ORM/query builder, schéma (nombre de tables, domaines)
- Auth : mécanisme(s) en place (JWT, sessions, OAuth…)
- Infrastructure : Docker, cloud, CI/CD
- Tests : présence, couverture, frameworks utilisés
- Structure du code : monolithique, modules, couplages visibles
- Points de douleur identifiés : dette technique, couplages forts, absence de tests, patterns problématiques

Pour chaque point, donne des exemples concrets tirés du code.

## Étape 2 — Analyse des options cibles

Sur la base de l'audit, évalue et compare :

**Framework backend :**
- Fastify vs Hono (vs alternatives pertinentes éventuelles)
- Critères : perf, écosystème, DX, adéquation clean architecture, maturité, communauté
- Recommande l'un ou propose les deux si le choix est vraiment serré

**Base de données :**
- Confirme ou challenge PostgreSQL selon la stack actuelle
- ORM/query builder recommandé (Drizzle, Prisma, Kysely…) et pourquoi
- Stratégie de migration des données

**Pattern d'architecture :**
- Clean Architecture, Hexagonal, Modular Monolith — ce qui fait sens pour ce projet selon sa taille et sa complexité
- Structure de dossiers cible (esquisse)

**Tests :**
- Framework recommandé (Vitest, Jest…)
- Stratégie : unit par use case, integration, e2e — comment couvrir sans ralentir les livraisons

## Étape 3 — Stratégie de migration dual-stack

Propose une stratégie de migration progressive :
- Séquençage des domaines à migrer (par risque, valeur, couplage)
- Design du dual-stack : comment l'ancien et le nouveau cohabitent (proxy inverse, feature flags, dual-write, etc.)
- Critères clairs de bascule pour chaque domaine
- Stratégie de rollback
- Estimation grossière par phase (en semaines)

## Livrable

Écris le document complet dans `docs/architecture/ope-184-proposition-stack-cible.md`.

Le document doit être structuré, argumenté, et actionnable. Pas de bullshit — si tu ne sais pas, dis-le. Si une décision est ouverte, expose les deux côtés clairement.

À la fin, mets à jour l'issue OPE-184 sur Linear avec un commentaire résumant les conclusions principales et indiquant que le document est prêt pour review.

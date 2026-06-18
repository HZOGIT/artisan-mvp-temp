# OPE-491 — Audit HRIS : conges, techniciens, utilisateurs, badges

Linear : https://linear.app/operioz/issue/OPE-491

## Mission

Auditer les 4 modules HRIS du new-stack sur 5 axes et poster un rapport structuré
en commentaire Linear sur OPE-491, puis créer les issues enfants pour les quick wins.

## Modules à auditer

- `src/modules/conges/`
- `src/modules/techniciens/`
- `src/modules/utilisateurs/`
- `src/modules/badges/`

## Étapes

### 1. Lecture du code source

Lire exhaustivement pour chaque module :
- `domain/*.ts` — entités, invariants, types
- `application/*.ts` — use-cases, règles métier
- `infra/*.ts` — schéma DB (Drizzle), requêtes
- `interface/trpc/*.ts` — contrats API exposés

### 2. Tests existants

```bash
find src/modules/conges src/modules/techniciens src/modules/utilisateurs src/modules/badges \
  -name "*.test.ts" | sort
```
Lire chaque fichier de test pour évaluer la couverture réelle.

### 3. Axes d'audit à couvrir

#### A. Complétude fonctionnelle vs standards HRIS

**Congés :**
- Types supportés (CP, RTT, maladie, sans-solde, maternité/paternité/parental) ?
- Solde : persisté en DB ou calculé à la volée ?
- Calcul des jours ouvrés/ouvrables : weekends exclus ? jours fériés exclus ?
- Acquisition mensuelle : logique dans `solde.ts` ?
- Workflow d'approbation : qui peut approuver (rôle) ?

**Techniciens :**
- Lien avec interventions/chantiers (`src/modules/interventions/`) ?
- Contrat de travail (CDI/CDD/intérimaire/sous-traitant) : stocké ?
- Planning de charge : agrégé quelque part ?

**Utilisateurs :**
- Rôles disponibles dans `CollaborateurRole` ?
- Permissions fines : granularité par ressource ou par module ?
- Audit log des actions sensibles (invitation, changement de rôle) ?

**Badges :**
- Déclenchement : automatique (`verifierBadges`) ou manuel (`attribuerBadge`) uniquement ?
- Cas d'usage documenté ? Valeur métier réelle ?

#### B. Conformité légale congés payés (droit du travail français)

Vérifier dans `src/modules/conges/application/solde.ts` et `domain/` :
- Acquisition : 2.5 jours ouvrables/mois de travail effectif (Code du travail L3141-3) ?
- Période de référence légale : 1er juin N → 31 mai N+1 ?
- Report : les CP non pris reportent-ils en N+1 jusqu'au 31 mai ?
- Prise minimale : 2 semaines consécutives en été ?
- Jours fériés tombant pendant un congé : décomptés ou non ?

#### C. Qualité du domaine

- Y a-t-il une machine d'état explicite pour les congés (brouillon → en_attente → approuvé/refusé/annulé) ?
- Les transitions interdites sont-elles gardées (ex: approuver un congé déjà approuvé) ?
- `calculerJoursConge` : pure function testable ? edge cases (congé sur 2 mois, weekends, etc.) ?

#### D. Couverture de tests

Classifier chaque test trouvé : L1 (unit/fake), L2 (repo Drizzle), L3 (router e2e).
Identifier les cas critiques NON testés (calcul de solde, conformité légale, transitions).

#### E. Lacunes & quick wins

Lister par sévérité :
- **P0** — bloque un usage réel en production
- **P1** — manque important mais contournable
- **P2** — amélioration à faible coût

### 4. Rapport et issues

**Poster en commentaire Linear OPE-491** un rapport structuré :
```
## Audit HRIS — 2026-06-17

### conges
**Complétude :** ...
**Conformité légale :** ...
**Tests :** ...
**Qualité domaine :** ...

### techniciens / utilisateurs / badges
[idem]

### Quick wins P0
- ...

### Quick wins P1
- ...
```

**Créer les issues enfants** (parentId: OPE-491) pour chaque P0 et P1 identifié,
avec title "fix(conges): ..." ou "feat(techniciens): ...".

Puis passer OPE-491 en **Done**.

## Règles

- Pas de commit dans cette tâche (audit read-only)
- Utiliser le MCP Linear pour poster le rapport et créer les issues
- Si un fix évident est < 30 min, l'implémenter et le committer (commit chirurgical)

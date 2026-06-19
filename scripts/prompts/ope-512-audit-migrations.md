# OPE-512 — Audit : déploiement des migrations DB

Linear : https://linear.app/operioz/issue/OPE-512

## Mission

Auditer le processus de déploiement des migrations PostgreSQL Drizzle dans le
projet Operioz, identifier les risques, et poster des recommandations structurées
en commentaire Linear avec des issues enfants actionnables.

Audit read-only (pas de commit). Durée max : 2h.

## Ce qu'on sait déjà

- **Dev local** : migrations jouées dans `docker-compose.yml` via la commande app :
  `pnpm exec drizzle-kit migrate` au démarrage du container
- **Staging** : `scripts/deploy-staging-newstack.sh` = docker `--build` + restart,
  mais AUCUNE étape migration visible dans le script
- **Config** : `drizzle.config.ts` — deux dialectes MySQL (legacy) et PostgreSQL (new-stack)
- **Migrations PG** : `drizzle/pg/` — 3 fichiers SQL numérotés (0000, 0001, 0002)
- **RLS** : provisionnement rôle `app_tenant` + policies = `scripts/rls/setup-app-role.mjs`
  (script manuel séparé)
- **Rollback** : aucun mécanisme documenté

## Étapes

### 1. Lire l'existant

```bash
# Config Drizzle
cat drizzle.config.ts

# Migrations existantes
ls -la drizzle/pg/
cat drizzle/pg/0000_pretty_puma.sql
cat drizzle/pg/0001_worthless_nomad.sql
cat drizzle/pg/0002_petite_war_machine.sql
cat drizzle/pg/meta/_journal.json 2>/dev/null || ls drizzle/pg/meta/

# Scripts de déploiement
cat scripts/deploy-staging-newstack.sh
cat Dockerfile

# RLS
ls scripts/rls/ 2>/dev/null
cat scripts/rls/setup-app-role.mjs 2>/dev/null

# Docker Compose
cat docker-compose.yml

# Scripts npm
grep "db:\|migrate\|drizzle" package.json
```

### 2. Répondre aux questions clés

- **Staging** : les migrations sont-elles jouées lors de `deploy-staging-newstack.sh` ?
  Si non : comment sont-elles appliquées (manuellement ? jamais ?)
- **Idempotence** : Drizzle-Kit migrate est-il safe si rejoué N fois ?
  (Vérifier si `drizzle/pg/meta/_journal.json` protège contre les re-runs)
- **Atomicité** : les migrations PG sont-elles dans une transaction ? Que se passe-t-il
  en cas d'échec à mi-chemin ?
- **RLS coupling** : si une migration ajoute une table, le provisionnement RLS
  (`setup-app-role.mjs`) doit-il être rejoué ? Y a-t-il un lien automatisé ?
- **Rollback** : Drizzle-Kit a-t-il un `down` ? Sinon, quel est le plan ?
- **Secrets** : `DATABASE_URL` (owner) vs `APP_DATABASE_URL` (app_tenant RLS) —
  la migration utilise bien le owner et pas le rôle restreint ?
- **Divergence** : peut-on avoir un `drizzle/pg/meta` qui dit "0002 appliqué"
  alors que la DB de staging est en retard ?

### 3. Benchmarker les bonnes pratiques

Comparer notre setup à :

**Pattern A — Migration embarquée dans l'app au démarrage** (actuel)
- `drizzle.migrate()` programmatique dans `server.ts`
- Avantages : simple, zero-config
- Risques : race condition si plusieurs instances, owner credentials dans le runtime

**Pattern B — Migration comme step CI/CD dédié**
- Job GitHub Actions / script de déploiement qui tourne AVANT le redémarrage du service
- Avantages : rollback possible, traçabilité, secrets isolés
- Inconvénients : plus complexe

**Pattern C — Expand/Contract**
- Pour les migrations breaking : ajouter la colonne nullable d'abord (expand), déployer,
  remplir les données, rendre non-nullable (contract)
- Nécessite 2 migrations + 2 déploiements

Évaluer lequel est adapté à notre contexte (staging only + 1 instance).

### 4. Rapport

Poster en commentaire Linear OPE-512 :

```markdown
## Audit migrations DB — 2026-06-18

### État des lieux
[description du flow actuel, avec les trous identifiés]

### Risques identifiés

#### P0 — Bloquant prod
- ...

#### P1 — Manque important
- ...

#### P2 — Amélioration DX
- ...

### Recommandations

1. ...
2. ...
```

Puis créer les issues enfants pour chaque P0 et P1 (parentId: OPE-512).
Passer OPE-512 en **Done**.

## Règles

- Audit read-only (pas de commit)
- Utiliser le MCP Linear pour poster le rapport et créer les issues enfants

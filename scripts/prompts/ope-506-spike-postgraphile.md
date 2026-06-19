# OPE-506 — Spike : PostGraphile + rôles PG personnalisés + RLS

Linear : https://linear.app/operioz/issue/OPE-506

## Mission

Conduire un spike d'analyse (read-only, pas de code à livrer) sur la faisabilité
d'utiliser PostGraphile + des rôles Postgres personnalisés + RLS pour auto-générer
le catalogue d'outils de l'agent IA Operioz.

Durée max : 2h. Livrable : commentaire structuré posté sur OPE-506 via MCP Linear.

## Contexte

L'agent IA Operioz a aujourd'hui ~23 outils hand-coded :
- Catalogue : `src/modules/assistant/domain/assistant-tools-catalog.ts`
- Registry : `src/modules/assistant/infra/agent-wiring.ts`
- Chaque outil = 3 fichiers à modifier manuellement (catalog + registry + handler)

La question : peut-on auto-générer tout ou partie depuis le schéma Drizzle/PG
via PostGraphile (introspection GraphQL → FunctionDeclaration Gemini) avec des
rôles PG dédiés et RLS pour que les permissions soient portées par la DB ?

## Étapes d'analyse

### 1. Lire le schéma existant

```bash
find src/db/schema -name "*.ts" | sort
find src/modules/assistant -name "*.ts" | grep -v test | sort
```

Lire :
- `src/modules/assistant/domain/assistant-tools-catalog.ts` — les 23 outils actuels
- `src/modules/assistant/infra/agent-wiring.ts` — le registry d'exécution
- `src/db/schema/` ou équivalent Drizzle — le schéma PG
- `migrations/` ou `src/db/migrations/` — les politiques RLS existantes

### 2. Analyser le schéma RLS actuel

```bash
grep -rn "SET LOCAL\|app.artisan_id\|set_config\|app_tenant" src/ migrations/ --include="*.ts" --include="*.sql" | head -40
```

Comprendre comment le multi-tenant est implémenté aujourd'hui.

### 3. Rechercher PostGraphile v5

Utiliser WebFetch / WebSearch pour lire la documentation PostGraphile v5 :
- Intégration Fastify (middleware `postgraphile`)
- Gestion multi-tenant avec RLS (SET LOCAL dans une transaction Postgres)
- Introspection GraphQL → peut-on en dériver des `FunctionDeclaration` Gemini ?
- Compatibilité avec Drizzle (PostGraphile lit le schéma PG natif, pas Drizzle)

### 4. Évaluer les rôles PG

Analyser si scinder `app_tenant` en :
- `app_readonly` — SELECT uniquement (outils de lecture de l'agent)
- `app_readwrite` — SELECT + INSERT + UPDATE (outils d'écriture)
est faisable sans refonte majeure des migrations RLS.

### 5. Rédiger le rapport

Poster en commentaire Linear OPE-506 un rapport structuré :

```
## Spike PostGraphile + rôles PG — 2026-06-18

### PostGraphile v5 — Verdict
[adopter / ne pas adopter / hybride]

**Avantages :** ...
**Risques :** ...
**Effort d'intégration :** (en jours)
**Impact sur le multi-tenant :** ...

### Rôles PG personnalisés — Verdict
[faisable / non faisable / différer]

**Faisabilité :** ...
**Migrations à prévoir :** ...

### Recommandation globale
...

### Prochaine issue actionnable (si verdict positif)
titre : ...
```

Puis passer OPE-506 en **Done**.

## Règles

- Spike read-only (pas de commit)
- Utiliser MCP Linear pour poster le rapport et clore l'issue
- Si WebFetch est nécessaire, chercher docs.postgraphile.com ou graphile.org

# OPE-444 — Audit : état actuel de l'observabilité

## Mission

Auditer l'état de l'observabilité de la plateforme Operioz (logs, métriques, alertes, tracing) et produire un rapport structuré + issues enfants sur les quick wins, en commentaire Linear sur OPE-444.

Linear : https://linear.app/operioz/issue/OPE-444

## Périmètre

### 1. Logging applicatif (`src/`)
```bash
grep -rn "console\.log\|console\.error\|console\.warn\|pino\|winston\|bunyan\|logger" src/ --include="*.ts" | grep -v ".test.ts" | head -40
grep -rn "uncaughtException\|unhandledRejection\|onError\|setErrorHandler" src/ --include="*.ts"
grep -rn "webhook\|stripe" src/ --include="*.ts" | grep -i "log\|console" | head -20
```

### 2. Health checks & métriques
```bash
grep -rn "health\|metrics\|prometheus\|fastify-metrics" src/ --include="*.ts"
grep -rn "/health\|/metrics\|/ping\|/status" src/ --include="*.ts"
```

### 3. Alertes
```bash
grep -rn "ntfy\|alert\|notify\|sendAlert" src/ --include="*.ts"
grep -rn "cron\|schedule\|setInterval" src/ --include="*.ts" | grep -v ".test.ts"
```

### 4. Request tracing
```bash
grep -rn "requestId\|request_id\|x-request-id\|correlationId\|traceId" src/ --include="*.ts"
```

### 5. Infrastructure staging
```bash
cat docker-compose*.yml 2>/dev/null || cat compose*.yml 2>/dev/null
cat devtools/deploy-staging-newstack.sh | grep -i "log\|monitor\|health"
```

## Méthode

1. Lancer les greps ci-dessus + lire les fichiers clés signalés
2. Vérifier `package.json` pour les dépendances de logging/monitoring installées
3. Vérifier le point d'entrée Fastify (`src/interface/http/server.ts` ou équivalent) pour l'error handler global
4. Classifier l'existant et les manques (P0/P1/P2)
5. Poster le rapport en commentaire Linear (OPE-444) via MCP Linear (`save_comment`)
6. Créer les issues enfants pour les quick wins identifiés (parentId: OPE-444)
7. Passer OPE-444 en Done

## Format du rapport (commentaire Linear)

```
## Audit observabilité — 2026-06-17

### Ce qui existe
- Logger : [outil + format]
- Health check : [oui/non, route]
- Alertes : [oui/non, mécanisme]
- Request ID : [oui/non]

### Angles morts critiques
**P0** — [manque bloquant en prod]
**P1** — [manque important]
**P2** — [amélioration]

### Plan d'action
**Quick wins (< 1 jour)**
1. ...
2. ...

**Chantiers moyen terme**
- ...
```

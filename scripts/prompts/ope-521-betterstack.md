# OPE-521 — Mise en place BetterStack

Linear : https://linear.app/operioz/issue/OPE-521

## Mission

Intégrer BetterStack (Logtail + Uptime) dans le backend Fastify Operioz pour
avoir des logs centralisés et du monitoring de disponibilité sur staging.

## Contexte technique

- **Backend** : Fastify 5, `apps/api/app.ts`, logger **désactivé** actuellement :
  `Fastify({ logger: false, maxParamLength: 5000 })` (ligne 335)
- **Runtime** : Node.js 22, Docker container `artisan-staging-new-stack-1`
- **Pino** : Fastify embarque pino nativement — il suffit d'activer le logger
  et d'y brancher un transport BetterStack

## Étapes

### 1. Lire le code existant

```bash
# App Fastify — où le logger est configuré
grep -n "logger\|Fastify\|pino" apps/api/app.ts | head -20

# Gestionnaire d'erreurs existant
grep -n "error\|catch\|onError" apps/api/app.ts | head -20

# Variables d'env disponibles
cat .env.local 2>/dev/null || cat .env 2>/dev/null | grep -v "KEY\|SECRET\|PASSWORD\|TOKEN"

# docker-compose — comment injecter des env vars
grep -A5 "environment:" docker-compose.yml | head -30
```

### 2. Vérifier si BETTERSTACK_TOKEN est déjà configuré

```bash
# Dans le container staging
docker exec artisan-staging-new-stack-1 env | grep -i "better\|logtail\|log" 2>/dev/null
```

Si le token n'est pas disponible, **demander à l'humain** via le bus agent
(`./scripts/agents/notify.sh human BLOCKED "OPE-521: BETTERSTACK_TOKEN manquant — besoin du token Logtail"`)
et décrire comment le récupérer (betterstack.com → Logs → Sources → Node.js).

Si le token est disponible, continuer.

### 3. Installer @logtail/pino

```bash
pnpm add @logtail/pino --filter @operioz/api
# ou, si pas de workspace filter :
cd apps/api && pnpm add @logtail/pino
```

### 4. Activer le logger Fastify avec transport BetterStack

Dans `apps/api/app.ts`, remplacer :
```typescript
const app = Fastify({ logger: false, maxParamLength: 5000 });
```

Par :
```typescript
const isProd = process.env.NODE_ENV === "production";
const betterStackToken = process.env.BETTERSTACK_TOKEN;

const app = Fastify({
  maxParamLength: 5000,
  logger: betterStackToken
    ? {
        transport: {
          target: "@logtail/pino",
          options: { sourceToken: betterStackToken },
        },
        level: isProd ? "info" : "debug",
        redact: ["req.headers.authorization", "req.headers.cookie"],
      }
    : process.env.NODE_ENV !== "test"
      ? { level: "info" }
      : false,
});
```

Points importants :
- `redact` : ne jamais logger les cookies (token JWT) ni les headers d'auth
- Si `BETTERSTACK_TOKEN` absent → logger pino standard (pas de crash)
- En test (`NODE_ENV=test`) → logger désactivé (pas de bruit dans les tests)

### 5. Ajouter des logs métier sur les événements critiques

Dans les routes/handlers critiques, ajouter des logs structurés :
```typescript
// Erreur Stripe
req.log.error({ event: "stripe_webhook_error", error: e.message }, "Stripe webhook failed");

// Rate limit IA
req.log.warn({ event: "ia_rate_limit", artisanId: ctx.artisanId }, "IA rate limit hit");
```

Chercher les endroits critiques :
```bash
grep -rn "TooManyRequestsError\|stripe.*error\|webhook.*error" apps/api/ \
  --include="*.ts" | grep -v test | head -20
```

### 6. Ajouter BETTERSTACK_TOKEN dans l'env staging

Dans `docker-compose.yml`, section `environment` du service `app` :
```yaml
BETTERSTACK_TOKEN: ${BETTERSTACK_TOKEN:-}
```

Dans `devtools/deploy-staging-newstack.sh` ou le `.env` de staging :
```bash
BETTERSTACK_TOKEN=<le_token>
```

**Ne jamais committer le token.** Le passer via variable d'env du shell ou `.env.local` (gitignored).

### 7. Vérifier TypeScript

```bash
npx tsc --noEmit -p tsconfig.src.json 2>&1 | grep error | head -20
```

### 8. Commit + déploiement

```bash
git add apps/api/app.ts package.json pnpm-lock.yaml docker-compose.yml
git commit -m "feat(monitoring): intègre BetterStack Logtail sur le logger Fastify (OPE-521)"
git push origin staging
./scripts/deploy-staging-newstack.sh
```

Vérifier que des logs apparaissent dans BetterStack après le déploiement
en faisant une requête sur staging.

### 9. Créer les checks Uptime BetterStack

Via l'API BetterStack ou l'interface web, créer des monitors HTTP :
- `https://staging.operioz.com` — check toutes les 3 min
- `https://staging.operioz.com/api/trpc/auth.me?batch=1` — check applicatif

Documenter les monitor IDs dans un commentaire sur OPE-521.

### 10. Clore OPE-521

Poster un commentaire de résumé sur Linear OPE-521 et passer en Done.

## Règles

- `BETTERSTACK_TOKEN` ne doit jamais être dans git
- Commit chirurgical : `git add <fichiers explicites>`, jamais `git add -A`
- Si le token est absent : notifier l'humain et ne pas bloquer

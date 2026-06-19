# Audit features IA — staging.operioz.com

## Mission

Vérifier que TOUTES les features IA du new-stack sont correctement câblées et fonctionnelles
sur `https://staging.operioz.com`. Rapporter le résultat via ntfy + bus inter-agents.

## Features IA à vérifier (call sites `deps.llm.complete()`)

| Module | Use-case | Procédure tRPC |
|--------|----------|----------------|
| `conseils-ia` | `getConseilsIA` | `trpc.conseilsIA` (query racine) |
| `articles` | `suggererArticlesIA` | `trpc.articles.suggererIA` |
| `client-portal` | `soumettreDemandeIA` | `trpc.clientPortal.soumettreDemandeIA` |
| `assistant` | `streamUseCase` / `generatorUseCase` | `/api/assistant/stream` (HTTP SSE) |
| `devis` | `genererLignesIA` | `trpc.devis.genererLignesIA` ou similaire |
| `commandes` | `genererDepuisDevisIA` | `trpc.commandes.*` |

## Méthode d'audit

### Étape 1 — Configuration LLM
```bash
# Vérifier que GEMINI_API_KEY et GEMINI_TEXT_MODEL sont configurés dans le déploiement staging
# Ne jamais afficher la clé, juste confirmer qu'elle est non-vide
grep -r "GEMINI_API_KEY\|GEMINI_TEXT_MODEL\|llm\|LlmPort" apps/api/app.ts apps/api/shared/ports/adapters.ts
# Vérifier les variables d'env disponibles dans le conteneur docker
docker exec operioz-api-staging env 2>/dev/null | grep -i "GEMINI\|LLM" | sed 's/=.*/=***/' || true
```

### Étape 2 — Test direct API (sans navigateur)
Authentifier avec le compte de test puis appeler chaque endpoint IA :
```bash
# Login pour obtenir le cookie
TOKEN=$(curl -s -c /tmp/cookies.txt -X POST https://staging.operioz.com/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"json":{"email":"dev@operioz.com","password":"Azerqsdf1234!"}}' | head -c 500)
echo "Login: $TOKEN"

# Test conseils-IA (query protégée)
curl -s -b /tmp/cookies.txt "https://staging.operioz.com/api/trpc/conseilsIA" \
  -H "Content-Type: application/json" | head -c 300

# Test suggérer articles IA (passer un descriptif simple)
curl -s -b /tmp/cookies.txt "https://staging.operioz.com/api/trpc/articles.suggererIA?input=%7B%22json%22%3A%7B%22description%22%3A%22pose%20carrelage%22%7D%7D" \
  | head -c 500
```

### Étape 3 — Playwright pour les flows UI IA
```bash
# Vérifier les pages qui déclenchent des appels IA
./scripts/pw-run.sh scripts/staging-e2e-mutations.mjs E2E_PASS='Azerqsdf1234!'
```

### Étape 4 — Lire les logs docker pour confirmer `llm_complete`
```bash
# Regarder les 50 dernières lignes de logs du conteneur
docker logs operioz-api-staging --tail 50 2>&1 | grep -i "llm\|gemini\|error\|GEMINI" || true
# Ou si le conteneur s'appelle différemment :
docker ps | grep -i "api\|operioz" | head -5
CONTAINER=$(docker ps --format '{{.Names}}' | grep -i api | head -1)
docker logs "$CONTAINER" --tail 100 2>&1 | grep -E "llm_complete|llm_error|GEMINI|gemini" || true
```

### Étape 5 — Vérifier le routeur tRPC pour chaque module IA

Pour chaque module IA, vérifier :
1. Le use-case est bien importé et appelé
2. Le `LlmPort` est injecté dans les dépendances (pas `null` ou `undefined`)
3. Aucun `if (!llm) return []` silencieux qui court-circuiterait l'IA

```bash
# Chercher les guards "si pas de llm, retourner vide" dans les routeurs
grep -rn "if.*!.*llm\|ia.*?.*\[\]\|llm.*null\|llmPort\|LlmPort" \
  apps/api/modules/*/interface/trpc/*.router.ts \
  apps/api/modules/*/application/*.ts \
  2>/dev/null | grep -v ".test." | head -30
```

### Étape 6 — Vérifier l'injection dans app.ts

```bash
grep -n "llm\|LlmPort\|Gemini\|IA\|ia" apps/api/app.ts | head -20
```

## Rapport attendu

Pour chaque feature IA :
- ✅ OK (réponse valide, llm_complete dans logs)
- ⚠️ Dégradée (endpoint répond mais avec fallback/vide)
- ❌ KO (erreur, timeout, ou guard silencieux)

## Diffusion du rapport

```bash
# Notifier l'humain via le bus
./scripts/agents/notify.sh human TASK_DONE "Audit IA staging terminé — voir les résultats ci-dessus"

# Notifier via ntfy
./scripts/agents/ntfy-pub.sh "Audit IA staging" "Résultats de l'audit features IA"
```

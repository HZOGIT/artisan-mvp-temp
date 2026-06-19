# Audit latence — agent IA Gemini

Linear projet : https://linear.app/operioz/project/assistant-ia-7323fa6494fe

## Contexte

L'agent IA Operioz (chat texte `/api/assistant/stream`) est lent à répondre.
L'architecture : client SSE → Fastify → `runAssistantAgent` → `GeminiAgenticAdapter.streamTurn`
→ `@google/genai` → boucle MAX_TURNS (outils exécutés séquentiellement).

Suspects identifiés avant même l'audit :
1. **Modèle** : `gemini-3-pro-preview` (default) — modèle "pro" lourd vs flash
2. **Import dynamique** : `await import(GENAI_MODULE)` à l'intérieur de `streamTurn()`
   → cold import à chaque requête si le module n'est pas en cache V8
3. **Pas d'instrumentation** : aucun timing pour distinguer latence API Gemini
   vs latence outils (DB) vs overhead applicatif
4. **Outils séquentiels** : dans la boucle agentique, chaque outil est exécuté
   l'un après l'autre, même si plusieurs pourraient être parallélisés
5. **System prompt reconstruit** à chaque tour (stats DB incluses)

## Mission

Auditer exhaustivement les sources de latence, mesurer ce qui peut l'être,
et produire un rapport avec des recommandations P0/P1/P2 + issues Linear.

## Étapes

### 1. Lire le code du chemin critique

```bash
# Adapter Gemini
cat apps/api/modules/assistant/infra/gemini-agentic-adapter.ts

# Boucle agentique (MAX_TURNS, outil par outil)
cat apps/api/modules/assistant/application/assistant-agent-use-cases.ts

# Adapters LLM partagés (modèle par défaut, température)
cat apps/api/shared/ports/adapters.ts
cat apps/api/shared/ports/llm.ts

# Prompt système (est-il lourd ? reconstruit à chaque requête ?)
cat apps/api/modules/assistant/domain/system-prompt.ts

# Handlers des outils de lecture (combien de requêtes DB ?)
cat apps/api/modules/assistant/application/read-tool-handlers.ts

# Registry (combien d'outils au total ?)
cat apps/api/modules/assistant/application/assistant-tool-registry.ts
cat apps/api/modules/assistant/domain/assistant-tools-catalog.ts | head -30
```

### 2. Mesurer la latence réelle (Playwright + timing)

Écrire un script de mesure rapide qui appelle `/api/assistant/stream` et
mesure le TTFT (time to first token) et le temps total. Le lancer 3 fois
avec différents messages (simple, avec tool call, multi-turn).

```bash
# Auth par cookie (comme staging-e2e-sweep)
# POST /api/assistant/stream avec message simple ("bonjour")
# Timer : début de la requête → premier chunk SSE reçu → dernier chunk
```

Exemple de script timing :
```js
// scripts/measure-assistant-latency.mjs
import { chromium } from "playwright";
// auth API puis fetch POST /api/assistant/stream, mesurer TTFT + total
```

### 3. Analyser chaque suspect

**A. Modèle**
- Quel modèle est configuré sur staging (`GEMINI_TEXT_MODEL` env) ?
  ```bash
  docker exec artisan-staging-new-stack-1 env | grep GEMINI
  ```
- `gemini-3-pro-preview` vs `gemini-2.5-flash` : flash est ~3-5x plus rapide
  pour des tâches de function-calling standard

**B. Import dynamique**
- `await import(GENAI_MODULE)` dans `streamTurn()` : V8 met en cache les
  modules dynamiques après le premier import, mais le pattern est fragile.
  Solution : singleton initialisé au démarrage du serveur.

**C. Stats DB dans le system prompt**
- `deps.statsReader.getStats(ctx)` est appelé à CHAQUE requête avant de
  streamer (dans `runAssistantAgent`). Combien de requêtes SQL fait cette
  méthode ?
  ```bash
  cat apps/api/modules/assistant/infra/assistant-stats-reader-drizzle.ts 2>/dev/null \
    || find apps/api -name "*stats*reader*" | head -5
  ```

**D. Outils DB — complexité des requêtes**
- Lire `read-tool-handlers.ts` : les handlers `chercher_client`,
  `lister_factures`, etc. font-ils des requêtes bien indexées ?
- Y a-t-il des requêtes N+1 (boucles avec query inside) ?

**E. Taille du payload outils → Gemini**
- 23 outils déclarés : le JSON des `functionDeclarations` peut peser lourd
  si les descriptions sont longues → overhead de sérialisation + tokens input
  ```bash
  node -e "
    const {toGeminiTools} = require('./apps/api/modules/assistant/infra/gemini-agentic-adapter');
    // mesurer la taille du payload tools
  "
  ```

**F. Historique re-envoyé**
- 10 messages injectés à chaque tour : si les messages sont longs, ça augmente
  les tokens input → latence

### 4. Tester le changement de modèle

Modifier temporairement le modèle dans `gemini-agentic-adapter.ts` pour tester
`gemini-2.5-flash` vs `gemini-3-pro-preview` et mesurer la différence de TTFT.
(Test local uniquement, pas de commit de prod sans validation)

### 5. Rapport + issues Linear

Poster en commentaire sur une nouvelle issue Linear (à créer dans le projet
"Assistant IA") un rapport structuré :

```markdown
## Audit latence agent Gemini — 2026-06-19

### Mesures
- TTFT message simple (sans outil) : Xms
- TTFT avec tool call : Xms
- Temps total avec tool call : Xms
- Modèle en prod : ...

### Sources de latence identifiées

#### P0 — Impact majeur
- ...

#### P1 — Impact modéré
- ...

#### P2 — Micro-optimisations
- ...

### Recommandation immédiate
...
```

Créer les issues enfants pour chaque P0 et P1.

## Règles

- Pas de commit de code de prod sans validation explicite
- Les scripts de mesure (`scripts/measure-assistant-latency.mjs`) peuvent
  être commités comme outillage de perf
- Commit chirurgical si des changements sont faits : `git add <chemins>`

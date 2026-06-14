# Audit — Rate limiting de l'assistant IA texte (extension d'OPE-24)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : endpoints IA bruts (`/api/assistant/stream`, `/api/voice/tool`) vs
> `checkRateLimit`. **Pas de nouvelle issue** (couvert par le thème d'OPE-24,
> burn Gemini) ; **OPE-24 corrigée/étendue par commentaire**.

---

## Constat — l'assistant texte n'est PAS rate-limité (contrairement à ce qu'affirmait OPE-24)

L'audit rate-limiting (et OPE-24) indiquait « AI endpoints (MonAssistant) :
30 req/h par artisan via `checkRateLimit` ✓ ». **C'est inexact pour le chat
principal.**

- `checkRateLimit(artisan.id)` est bien appliqué sur des **routes tRPC d'IA
  auxiliaires** (conseils IA `routers.ts:298,458,528`, devis IA `:3927`, analyse
  photo `:6996,7016,7049,7087,7115`, etc.).
- Mais **PAS** sur les **endpoints Express bruts** de l'assistant :
  `awk '/checkRateLimit/' index.ts[921..1264]` → **0**. Notamment
  **`/api/assistant/stream`** (`index.ts:921`), le **chat agentique principal**.

### Profil de coût

`/api/assistant/stream` lance une **boucle agentique** :
```typescript
// index.ts:976
const MAX_TURNS = 10;
for (let turn = 0; turn < MAX_TURNS && !aborted; turn++) { /* appel Gemini + tools */ }
```
→ **jusqu'à 10 appels Gemini par requête**, sans aucun plafond de fréquence.

### Exploitation

Tout utilisateur authentifié — artisan **ou collaborateur** (cf. OPE-54, l'assistant
est accessible aux collaborateurs) — peut **boucler** `/api/assistant/stream`
→ jusqu'à 10× appels Gemini/req, **non bornés** → **burn de la clé `GEMINI_API_KEY`
partagée** (dev/staging, et prod). `/api/voice/tool` est aussi non limité.

---

## Action

- **Pas de nouvelle issue** (anti-doublon : OPE-24 = « rate limiting manquant /
  burn Gemini »).
- **OPE-24 corrigée + étendue** par commentaire : ajouter `/api/assistant/stream`
  (texte agentique, ≤10 appels Gemini/req) et `/api/voice/tool` au périmètre, et
  retirer l'affirmation « MonAssistant texte rate-limité ».

## Fix proposé (pour OPE-24)

Appliquer `checkRateLimit(artisan.id)` en tête de `/api/assistant/stream` et
`/api/voice/tool` (renvoyer 429 si dépassé), comme sur les routes tRPC d'IA.
Idéalement un budget **par tour** (compter les MAX_TURNS appels), pas seulement
par requête.

### Estimation

~1 h (en plus d'OPE-24).

# Audit — `/api/assistant/stream` non rate-limité (burn Gemini) → OPE-24

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `app.post('/api/assistant/stream')` (`server/_core/index.ts:921-1079`),
> `checkRateLimit` (`routers.ts:38`). Fait suite au travail récent sur l'assistant
> (refonte sidebar, garde anti-réponse-vide avec retry).

---

## Ce qui est correct

- **Auth** : `getUserFromRequest` → 401 si non connecté (`:924`). Artisan résolu → 404
  sinon. Message requis → 400. Pas d'accès anonyme.

## 🟠 HIGH — pas de rate limit → burn Gemini (rattaché à **OPE-24**)

`grep checkRateLimit` dans le handler `/api/assistant/stream` → **0**. Le limiteur
existant `checkRateLimit(artisan.id)` (30/h/tenant) est appliqué aux **outils IA tRPC**
(`routers.ts:298/458/528/3309`…) **mais pas** à cet endpoint Express — qui est pourtant
**l'endpoint IA texte principal** (chaque message du chat).

**Coût par requête** : boucle agentique jusqu'à `MAX_TURNS = 10` (1 appel Gemini par
tour) **+** garde anti-réponse-vide récent (`emptyRetries < 2`) → jusqu'à ~12 appels
Gemini pour **une seule** requête. Un compte authentifié scripté épuise la clé
`GEMINI_API_KEY` **partagée** en minutes, pour tous les tenants.

**Distinct du périmètre listé d'OPE-24** (qui couvre `/api/voice/token`,
`importFromExcel`, body 50MB) → même classe « rate limiting manquant / burn Gemini »,
endpoint non listé → **OPE-24 étendu par commentaire** (4ᵉ vecteur). Pas de doublon.

**Fix** : appliquer `checkRateLimit(artisan.id)` en tête de `/api/assistant/stream`
(et des autres endpoints Express → Gemini : voice/token, voice/tool). Extraire
`checkRateLimit` de `routers.ts` vers un module partagé importable par `index.ts`.
Limite ~20-30 msg/h/tenant.

---

## Verdict

`/api/assistant/stream` : **authentifié** mais **non rate-limité** → coût Gemini non
borné par tenant (amplifié par le retry anti-vide). Même classe qu'**OPE-24** (vecteur
non listé) → rattaché par commentaire. **Pas de nouvelle issue Linear.**

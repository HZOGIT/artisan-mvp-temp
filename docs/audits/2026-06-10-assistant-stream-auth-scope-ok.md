# Audit — `/api/assistant/stream` : authentification & scope tenant — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : endpoint SSE `/api/assistant/stream` (`index.ts:921-960+`), le plus coûteux
> (Gemini en streaming). Vérif : auth, isolation tenant, bornes.

---

## Conclusion : authentifié + tenant-scopé. Pas de BLOCKER/HIGH.

Enjeu : un endpoint **streaming Gemini** non authentifié serait un **burn de budget IA
anonyme** + une question sur l'`artisanId` ciblé. Vérifié — ce n'est **pas** le cas.

### Authentification présente

```typescript
// index.ts:923-925
const user = await getUserFromRequest(req);
if (!user) { res.status(401).json({ error: 'Non autorisé' }); return; }
```

→ Un appel **anonyme** est rejeté `401`. (Contrairement à `/api/voice/debug` audité
séparément qui, lui, est public.)

### Scope tenant depuis la session (jamais l'input)

`artisan = getArtisanByUserId(user.id)` (`:928`, `404` sinon) → le **system prompt** et les
**tools** opèrent sur `artisan.id` **dérivé du JWT**, jamais d'un `artisanId` d'entrée. Pas
d'accès cross-tenant via l'assistant (cohérent avec l'audit `assistant-tools-isolation`).

### Bornes d'entrée

- `message` requis (`400` sinon, `:932`).
- `history` borné aux **10 derniers** tours (`history.slice(-10)`, `:942`) → pas
  d'explosion du contexte par un historique géant fourni par le client.
- `pageContext` typé string optionnel.

---

## Écart connu = déjà filé

- **Rate-limit** : pas de `checkRateLimit` par appel sur ce stream → burn Gemini possible
  par un tenant authentifié → **déjà filé** (OPE-24 / `assistant-stream-rate-limit`). Pas
  de doublon. (Le garde anti-réponse-vide retry/fallback est en place.)

---

## Verdict

`/api/assistant/stream` est **authentifié** (`401` si anonyme) et **tenant-scopé**
(`artisan.id` du JWT, jamais de l'input), avec `history` borné. Pas de burn anonyme, pas
d'accès cross-tenant. Seul écart = **rate-limit** (déjà filé OPE-24). **Pas de nouvelle
issue Linear.**

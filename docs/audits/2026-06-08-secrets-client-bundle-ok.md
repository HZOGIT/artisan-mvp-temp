# Audit — Exposition de secrets au navigateur (bundle client + token vocal) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : fuite éventuelle de secrets côté client — variables `import.meta.env`
> / `VITE_*`, références directes à des clés dans `client/src`, et la frontière
> sensible `/api/voice/token` (Gemini Live). Contrainte projet explicite :
> **`GEMINI_API_KEY` ne doit jamais atteindre le navigateur.**

---

## Conclusion : aucun secret exposé au client. Pas de BLOCKER/HIGH.

### Bundle client — pas de secret

- `grep -rniE "GEMINI_API_KEY|STRIPE_SECRET|JWT_SECRET|TWILIO|DATABASE" client/src`
  → **0 résultat**. Aucune référence à une clé serveur côté front.
- `import.meta.env` n'est utilisé que pour `VITE_TAWK_ID` (id widget chat, public)
  et un getter générique (`const.ts:7`).
- Variables `VITE_*` définies (`.env.local`/`.env.staging`) : `VITE_APP_TITLE`,
  `VITE_APP_LOGO`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY` —
  **toutes publiques/publishable** (les clés *publishable* Stripe/Clerk sont
  conçues pour être exposées). Aucune clé secrète n'est préfixée `VITE_`.
- **Modèle Vite** : seules les variables `VITE_*` sont injectées dans le bundle ;
  `GEMINI_API_KEY`/`STRIPE_SECRET_KEY`/`JWT_SECRET` (non préfixées) ne sont **jamais**
  inlinées côté client, même si du code tentait de les lire via `import.meta.env`.

### `/api/voice/token` — token éphémère, pas la clé

Le seul point où des identifiants Gemini approchent la frontière client est géré
correctement (`index.ts:1099-1208`) :

```typescript
// La clé brute n'est utilisée que SERVEUR→Google pour créer un token éphémère :
const apiKey = process.env.GEMINI_API_KEY!;
const tokenRes = await fetch(`https://.../v1alpha/auth_tokens?key=${apiKey}`, { ... body: { uses: 1, expire_time: +30min, new_session_expire_time: +1min, ... } });
const tokenData = await tokenRes.json();
res.json({ token: tokenData?.name || tokenData?.token, wsUrl, model, expiresAt }); // ← token ÉPHÉMÈRE renvoyé, pas apiKey
```

- Le client ne reçoit qu'un **token éphémère** (`uses: 1`, valide 30 min, session à
  démarrer < 1 min) → il ouvre directement la WebSocket Gemini Live.
- La **`GEMINI_API_KEY` brute n'est jamais renvoyée** au navigateur.
- Endpoint **authentifié** (`getUserFromRequest` → 401 sinon).
- En cas d'erreur Gemini, le corps d'erreur est **loggé serveur** mais **pas
  renvoyé** au client (message générique).

---

## Réserve (déjà tracée)

- **`/api/voice/token` sans rate limit** → un compte authentifié peut créer des
  tokens éphémères en boucle (burn API Gemini ; clé partagée dev/staging). **Déjà
  OPE-24** (problème 1).

---

## Verdict

Gestion des secrets **conforme** : rien de sensible dans le bundle (modèle Vite +
0 référence), `VITE_*` uniquement publishable, et `/api/voice/token` renvoie un
**token éphémère** et non la clé. Contrainte « `GEMINI_API_KEY` jamais au
navigateur » **respectée**. Seule réserve : rate limit du token vocal (**OPE-24**).
**Pas d'issue Linear créée.**

# Audit — Proxy Cloudflare Pages Function (`/api/*`) + CORS — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `functions/api/[[path]].js` (proxy front→backend), configuration CORS
> (`server/`, `functions/`).

---

## Conclusion : proxy sain (pas d'open-proxy/SSRF, pas de CORS permissif). Pas de BLOCKER/HIGH.

### Pas de CORS permissif

`grep Access-Control-Allow-Origin|Allow-Credentials|cors(` sur `server/` + `functions/`
→ **0**. Architecture : le front (Pages) et `/api/*` sont **même origine**
(`staging.operioz.com`) via le proxy → les cookies (host-only, SameSite=Lax) fonctionnent
**sans** CORS. Le backend direct (`staging-backend.operioz.com`) **ne pose aucun**
`Access-Control-Allow-Origin` → une page tierce **ne peut pas** lire ses réponses
credentialed (blocage navigateur par défaut). Pas de fuite cross-origin.

### Pas d'open-proxy / SSRF

```js
const BACKEND = "https://staging-backend.operioz.com";   // constant
const target = BACKEND + url.pathname + url.search;       // host FIXE
```

- L'hôte cible est **constant** ; seuls `pathname`/`search` (normalisés par `new URL`) sont
  ajoutés → impossible de détourner le proxy vers un hôte arbitraire (pas de SSRF, pas de
  pivot via `@`/`..` : la cible reste sur `staging-backend.operioz.com`).
- `redirect: "manual"` → le proxy **ne suit pas** les redirections (pas de SSRF via
  redirect).
- `headers.delete("host")` → laisse `fetch` poser le bon Host pour le routage tunnel.
- Body forwardé en `duplex: "half"` pour les méthodes à corps. Cookies/Set-Cookie
  traversent (auth round-trip OK, host-only → scopé à `staging.operioz.com`).

---

## Confirme un écart **déjà filé** (anti-doublon)

Le proxy **recopie tous les headers** entrants, dont un `X-Forwarded-For` **fourni par le
client** (spoofable), sans imposer l'IP de confiance. Le rate-limit auth backend clé sur
`XFF[0]` → **contournable** = **OPE-80** (déjà filé). Bonne nouvelle : Cloudflare pose
`CF-Connecting-IP` (non spoofable) et le proxy **le forwarde déjà** → le fix d'OPE-80
(backend : utiliser `CF-Connecting-IP`) est directement applicable. Pas de doublon.

---

## Verdict

Proxy Pages Function : **hôte backend constant** (pas d'open-proxy/SSRF), `redirect:manual`,
**pas de CORS permissif**, cookies forwardés (même origine). Seul écart = forward du `XFF`
spoofable = **OPE-80 déjà filé** (le header de confiance `CF-Connecting-IP` est déjà
transmis). **Pas de nouvelle issue Linear.**

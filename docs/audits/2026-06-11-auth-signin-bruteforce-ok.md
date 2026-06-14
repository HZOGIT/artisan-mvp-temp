# Audit — Auth `signin` : protection brute-force / credential stuffing — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `auth.signin` (`server/routers.ts`) + middleware de rate-limit auth
> (`server/_core/index.ts:214-246`).

---

## Conclusion : le `signin` est **protégé contre le brute-force** (5 tentatives / 15 min / IP, IP non falsifiable). Aucun BLOCKER/HIGH. 1 réserve **LOW** (per-IP vs per-compte).

### ✅ Rate-limit auth en place

```
// index.ts:214-246
const authAttempts = new Map(); AUTH_MAX = 5; AUTH_WINDOW_MS = 15 min
app.use('/api/trpc', (req,res,next) => {
  isAuth = path includes 'auth.signin' || 'auth.signup'
  ip = cf-connecting-ip || xff[0] || socket   // OPE-80 : CF-IP prioritaire (non spoofable)
  > 5 tentatives / 15 min ⇒ 429 + Retry-After
})
```

- **5 tentatives / 15 min par IP** sur `signin`/`signup` → un brute-force de mots de passe
  est borné (≤ 5 essais avant blocage 15 min).
- **IP via `CF-Connecting-IP`** (posée par Cloudflare en edge, **non falsifiable**) — corrige
  le contournement par `X-Forwarded-For` spoofé (**OPE-80**, cf. audit
  `rate-limit-auth-xff-spoofing`). Fallback XFF/socket hors Cloudflare.
- **Bucket séparé** pour `forgotPassword`/`resetPassword` (`:256-283`, 5/15 min) → une
  récupération légitime n'est pas pénalisée par des échecs de login, et l'email-bombing est
  borné.
- `authenticateUser` renvoie un message **générique** (« Invalid email or password ») → pas
  d'énumération (cf. `enumeration-comptes-forgot-signin-signup-ok`).

### ✅ Bonus constaté : OPE-7 (signup incomplet) **auto-réparé au signin**

`signin` appelle `db.bootstrapArtisanAccount(user.id)` **si `dbUser.artisanId` est null**
(propriétaire dont le signup d'avant-fix a échoué) — idempotent, best-effort, non bloquant,
et **uniquement pour les propriétaires** (un collaborateur a déjà `artisanId` → pas de
bootstrap erroné). ⇒ OPE-7 est **mitigé en self-heal** en plus du fix signup. *(À confirmer/
fermer par un humain — non fermé ici.)*

---

## 🟡 Réserve LOW — rate-limit per-IP, pas per-compte

Le compteur est **par IP**. Un attaquant **distribué** (botnet/proxies) peut tenter 5
essais par IP par compte → **credential stuffing distribué** théoriquement possible. Un
**verrou par compte** (N échecs sur un email → ralentissement/captcha) complèterait, mais
introduit un **risque de DoS de victime** (lock-out volontaire) — arbitrage produit. Le
per-IP 5/15 min est la **première ligne standard** et **suffisant pour le MVP** ;
amélioration possible : captcha après N échecs, ou comptage par (IP+email). **LOW**, sous le
seuil BLOCKER.

---

## Verdict

Le `signin` est **correctement protégé** contre le brute-force et le credential stuffing
basique : **5 tentatives / 15 min** sur une **IP non falsifiable** (CF-Connecting-IP,
OPE-80), bucket reset séparé, messages génériques anti-énumération. **Aucun BLOCKER/HIGH.**
Bonus : **OPE-7 auto-réparé** au login. Seule réserve **LOW** : un verrou per-compte
(anti-stuffing distribué) serait un plus, non bloquant. **Pas de nouvelle issue Linear.**

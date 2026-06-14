# Audit — Rate-limit auth contournable via X-Forwarded-For (spoofing) → OPE-80

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : middleware de rate-limit auth (`server/_core/index.ts:195-219`), lecture
> d'IP (`:200-201`), proxy Pages Function (`functions/api/[[path]].js`), exposition
> `staging-backend.operioz.com`.

---

## 🟠 HIGH trouvé → **OPE-80** (issue créée)

Le rate-limit brute-force du login (signin/signup, 5/15 min/IP) clé sur la **1ʳᵉ**
valeur de `X-Forwarded-For` :

```typescript
// index.ts:200
const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
  || req.socket.remoteAddress;
```

L'app est **toujours derrière Cloudflare** (tunnel prod + staging, + proxy Pages en
staging). Cloudflare **append** l'IP réelle en **fin** de XFF (ne supprime pas la valeur
client). Donc `split(',')[0]` = la valeur **fournie par l'attaquant**. En faisant tourner
le header `X-Forwarded-For`, l'attaquant obtient un **bucket neuf à chaque requête** →
**brute-force illimité** sur `auth.signin`. `staging-backend.operioz.com` est public
(200 direct) → surface directe en plus.

**Prod-relevant** (tunnel Cloudflare = même append XFF) — pas qu'un artefact staging.

**Fix** (cf. OPE-80) : utiliser **`CF-Connecting-IP`** (non spoofable, posé par CF) +
repli sur la **dernière** valeur XFF ; faire propager l'IP réelle par le Pages Function
en staging ; appliquer à tous les limiteurs IP (+ forgotPassword, cf. OPE-76).

---

## Anti-doublon

- OPE-23/OPE-22 = limites **SMS** ; OPE-24 = endpoints **sans aucune** limite ; OPE-76 =
  portée du limiter (forgotPassword) + origin poisoning. Aucune ne couvre le **spoofing
  de la clé IP** du limiter auth → **OPE-80 créée** (pas de doublon).

---

## Verdict

La limite brute-force du login **existe mais est contournable** (clé IP = XFF[0],
falsifiable derrière Cloudflare) → protection annulée. → **OPE-80 (HIGH)**. Fix : clé
IP de confiance via `CF-Connecting-IP`/dernière valeur XFF.

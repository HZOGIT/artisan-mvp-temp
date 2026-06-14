# Audit — Flux « mot de passe oublié » : reset poisoning via header Origin → OPE-76

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `auth.forgotPassword` / `auth.resetPassword` (`server/routers.ts:9058-9141`),
> middleware rate-limit auth (`server/_core/index.ts:195-219`). Vecteurs recherchés :
> entropie/stockage du token, expiration, usage unique, énumération d'utilisateurs,
> **host-header / origin injection**, rate limiting.

---

## Ce qui est correct (flow bien conçu)

| Contrôle | Constat | Verdict |
| -- | -- | -- |
| Entropie token | `randomBytes(32).toString('hex')` (`:9065`) | ✅ 256 bits |
| Stockage au repos | `resetToken = sha256(rawToken)` (`:9066`) — le clair n'est jamais en base | ✅ |
| Expiration | 1 h (`:9067`) | ✅ |
| Usage unique | `resetPassword` met `resetToken:null, resetTokenExpiry:null` (`:9137-9138`) | ✅ |
| Anti-énumération | Réponse constante `{ success:true }` quel que soit l'email (`:9114-9115`) | ✅ |
| Comptes éligibles | Seulement `actif !== false && password` (exclut OAuth-only) (`:9064`) | ✅ |

→ Le cœur du flow (OPE-8 implémenté) est solide.

---

## 🟠 BLOCKER/HIGH trouvé → **OPE-76** (issue créée)

**Reset password poisoning (CWE-640)** : le lien de reset est construit en faisant
confiance **en priorité** au header `Origin` de la requête, contrôlable par l'appelant
d'une `publicProcedure` :

```typescript
// routers.ts:9073-9075
const origin = (ctx.req.headers.origin as string)
  || process.env.APP_URL || 'https://www.operioz.com';
const resetUrl = `${origin}/reset-password?token=${rawToken}`;
```

**Exploitation** : `POST auth.forgotPassword` (public) avec `Origin: https://evil.com`
+ email de la victime → Operioz envoie à la **vraie** boîte de la victime un email
**authentique brandé Operioz** dont le bouton pointe vers `evil.com/reset-password?
token=<rawToken>`. Au clic, le token brut fuit vers l'attaquant qui le rejoue sur le
vrai `resetPassword` < 1 h → **prise de contrôle du compte**.

**Aggravant** : `forgotPassword` n'est **pas** dans la portée du rate-limit auth
(`index.ts:198` ne matche que `auth.signin`/`auth.signup`) → email-bombing + burn quota
Resend.

**Fix** (cf. OPE-76) : bâtir le lien depuis `process.env.APP_URL` server-side (ignorer
`Origin`), comme déjà fait en `index.ts:1317` / `routers.ts:8238/8273` ; +
allowlist si multi-origine ; + throttler `forgotPassword`/`resetPassword`.

### Exploitabilité — pourquoi HIGH et non BLOCKER

Le token transite par l'email de la **victime** (pas directement chez l'attaquant) →
un **clic** est requis. Mais l'email étant réellement émis par Operioz (confiance
maximale, ≠ phishing classique), le taux de succès est non négligeable, surtout couplé
à un prétexte. Account takeover complet à la clé → **HIGH**, à corriger avec le fix
OPE-8 avant lancement.

---

## Pattern systémique (noté dans OPE-76, pas d'issue séparée)

`ctx.req.headers.origin` sert aussi à construire `portail/${token}` (`:3723`),
`avis/${token}` (`:5046/:5102`), lien paiement (`:1631`). **Ceux-là sont déclenchés
par un artisan authentifié** (origin = son propre navigateur), donc **non
attaquant-contrôlés** dans le flow nominal → robustesse, pas faille. À aligner sur
`APP_URL` en même temps que le fix OPE-76.

---

## Anti-doublon

- **OPE-8** = *absence* du flow reset (implémenté depuis) → ne couvre pas le poisoning.
- **OPE-32** = sessions JWT non révoquées après reset → concern distinct.
- Aucune issue existante sur host/origin injection → **OPE-76 créée** (pas de doublon).

---

## Verdict

Flow reset cryptographiquement sain (token 256 bits haché, 1 h, usage unique,
anti-énumération) **mais** lien dérivé du header `Origin` non fiable → **reset
poisoning / account takeover** + `forgotPassword` non rate-limité. → **OPE-76 (HIGH)**.

# Audit — Auth : mots de passe, reset, sessions — robuste, gaps déjà filés

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `authRouter` (`routers.ts:8977-9230`) — `signup`/`signin`/`updatePassword`/
> `forgotPassword`/`resetPassword`/`updateEmail`/`deleteAccount` ; cookie/JWT
> (`auth-simple.ts`) ; rate-limit auth (`index.ts:204-235`).

---

## Conclusion : fondamentaux corrects. Aucun NOUVEAU BLOCKER/HIGH. Les gaps connus sont déjà filés.

### ✅ Ce qui est correct

- **Hachage** : bcrypt (`auth.ts:9`, `genSalt(10)` + `compare`). Pas de comparaison naïve.
- **Token de reset** : `randomBytes(32)` (crypto-sûr, **pas** `Math.random`), **haché
  SHA-256 au repos** (`routers.ts:9131-9136`), **expiry 1h**, **usage unique** (token mis à
  `null` après usage, `:9203-9204`). Brute-force du token = 256 bits → infaisable.
- **Anti-énumération** : `forgotPassword` renvoie toujours `{ success: true }` (`:9181`) ;
  `signin` renvoie un message générique « Invalid email or password » (`:9057`).
- **Rate-limit auth** : 5 tentatives / 15 min / IP sur `signin` + `signup`
  (`index.ts:204-235`) → brute-force de mot de passe borné.
- **Cookie** : `httpOnly` + `secure` (prod) + **`sameSite:"lax"`** (`auth-simple.ts:51-57`)
  → les mutations tRPC (POST) ne partent pas en cross-site ⇒ **CSRF mitigé**.
- **`updatePassword`** vérifie l'ancien mot de passe avant de changer (`:9109`).
- **`deleteAccount`** exige une confirmation explicite (`'SUPPRIMER'`, `:9213`) ; soft-delete.

### 🟡 Gaps connus — déjà filés (anti-doublon : pas de nouvelle issue)

| Constat | Issue |
| -- | -- |
| `forgotPassword` construit le lien reset depuis `ctx.req.headers.origin` (header client) → **reset poisoning / account takeover** (`:9139-9141`) | **OPE-76** (couvre précisément `origin` + l'aggravant ci-dessous) |
| `forgotPassword` (et `resetPassword`) **hors** du middleware rate-limit (qui ne cible que `signin`/`signup`, `index.ts:214`) → email-bombing / quota Resend | **OPE-76** (aggravant) + **OPE-24** (forgotPassword sans rate-limit) |
| Rate-limit auth basé sur `X-Forwarded-For[0]` **spoofable** (`index.ts:216`) | **OPE-80** |
| `resetPassword` / `updatePassword` **n'invalident pas les sessions JWT existantes** (stateless, 7j) → après reset post-compromission, l'ancienne session reste valide | **OPE-32** |
| `updateEmail` (`:9086`) sans ré-authentification | **OPE-85** |

### 🟢 Observations LOW (sous le seuil, pas d'issue)

1. **Politique de mot de passe faible** : `signup`/`resetPassword`/`updatePassword` =
   `z.string().min(6)`, **sans** exigence de complexité ni blacklist (mots de passe
   courants). 6 caractères = faible, mais borné par le rate-limit signin (5/15min/IP). Reco
   post-lancement : `.min(8)` + check zxcvbn/Pwned ou complexité minimale.
2. **Oracle temporel `forgotPassword`** : le corps de réponse est constant, mais le
   **temps de traitement** varie (compte existant + actif + password → `randomBytes` +
   hash + UPDATE + `sendEmail` ; sinon retour immédiat). Side-channel de timing → fuite
   probabiliste de l'existence d'un email. Exploitation peu fiable (jitter réseau). Reco :
   uniformiser le temps (ou traitement asynchrone systématique).

---

## Verdict

Le socle auth (bcrypt, token reset crypto-sûr/haché/usage-unique/1h, anti-énumération,
rate-limit signin, cookie `sameSite:lax`) est **solide**. Les vrais défauts —
reset-poisoning (OPE-76), rate-limit spoofable (OPE-80) / absent sur forgotPassword
(OPE-24), sessions non révoquées (OPE-32), updateEmail sans ré-auth (OPE-85) — sont
**tous déjà filés**. Reste deux points **LOW** (politique de mot de passe `min(6)`, oracle
temporel forgotPassword) sous le seuil BLOCKER/HIGH. **Pas de nouvelle issue Linear.**

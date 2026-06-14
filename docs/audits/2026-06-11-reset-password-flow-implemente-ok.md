# Audit — Flow « mot de passe oublié / réinitialisation » (implémenté) : solide, 2 réserves déjà filées

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `auth.forgotPassword` (`server/routers.ts:9529`), `auth.resetPassword`
> (`:9599`), `getUserByValidResetToken` (`server/db.ts`). OPE-8 (« aucun flow reset »)
> est **désormais implémenté** dans le code — re-vérification de l'implémentation.

---

## Conclusion : le flow reset est **correctement conçu**. Aucun nouveau BLOCKER/HIGH. Les 2 faiblesses résiduelles sont **déjà tracées** (OPE-76, OPE-32).

### ✅ Points conformes (vérifiés dans le code)

| Contrôle | État |
| -- | -- |
| **Entropie du token** | `randomBytes(32)` (256 bits) — crypto-sûr, non brute-forçable (`:9543`) |
| **Stockage** | seul le **SHA-256** du token est stocké (`resetToken: tokenHash`), pas le token brut → une fuite DB ne donne pas de lien exploitable (`:9544-9546`) |
| **Expiration** | 1 h ; `getUserByValidResetToken` filtre `gte(resetTokenExpiry, now())` → un token expiré est **rejeté** (`db.ts`) |
| **Usage unique** | `resetPassword` met `resetToken/expiry = null` après usage (`:9613-9614`) |
| **Énumération de comptes** | `forgotPassword` renvoie **toujours** `{ success: true }`, même email inconnu/inactif/OAuth-only → pas de révélation (`:9529-9597`) |
| **Anti-flood** | `checkPasswordResetRate(email)` (réponse constante préservée au-delà du seuil) (`:9534`) |
| **Comptes éligibles** | uniquement `actif !== false` **et** `user.password` présent (exclut OAuth-only) (`:9542`) |
| **Échec d'envoi email** | non bloquant + logué, n'altère pas la réponse constante (`:9588`) |

### 🟡 Réserve 1 — Origin poisoning (lien construit depuis `headers.origin`) → **déjà filé OPE-76**

`const origin = ctx.req.headers.origin || APP_URL` puis
`resetUrl = ${origin}/reset-password?token=${rawToken}` (`:9548-9550`). Le header
`Origin` est **contrôlé par l'attaquant** : en déclenchant un reset pour la victime
avec `Origin: https://attaquant.tld`, l'email reçu par la **victime** pointe vers le
domaine de l'attaquant **avec le token brut valide** → si la victime clique, vol du
token → **prise de contrôle du compte**. **C'est exactement OPE-76** (HIGH, ouvert).
Fix attendu : construire l'URL depuis une **allowlist** / `APP_URL` de confiance, pas
depuis `Origin`. **Pas de nouvelle issue.**

### 🟡 Réserve 2 — Sessions JWT non invalidées après reset → **déjà filé OPE-32**

`resetPassword` change le mot de passe mais **n'invalide pas les JWT existants** (pas
de `tokenVersion`/revocation). Un attaquant déjà session-é avant le reset **conserve**
son accès. **C'est OPE-32** (HIGH, ouvert). **Pas de nouvelle issue.**

---

## Note connexe (hors périmètre reset)

`deleteAccount` (`:9620`) : soft-delete propre (`actif=false`, email neutralisé
`deleted_<id>_<ts>@…` pour réutilisation, données conservées pour obligation
comptable), `clearAuthCookie` ensuite. Conforme. (Les autres sessions actives
relèvent de la même OPE-32.)

---

## Verdict

Le flow **forgot/reset password** (OPE-8 désormais implémenté) est **robuste** :
token 256 bits haché au repos, expiration 1 h vérifiée en SQL, usage unique,
anti-énumération à réponse constante, anti-flood. **Aucun nouveau BLOCKER/HIGH.** Les
**deux** vecteurs réels (origin poisoning, non-révocation des sessions) sont **déjà
couverts par OPE-76 et OPE-32**. **Pas de nouvelle issue Linear** (anti-doublon).

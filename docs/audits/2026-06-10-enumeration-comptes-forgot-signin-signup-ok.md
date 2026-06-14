# Audit — Énumération de comptes (forgotPassword / signin / signup) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `auth.forgotPassword` (`routers.ts:9067-9125`), `auth.signin`
> (`:8992+`), `auth.signup` (`:8920+`), token de reset.

---

## Conclusion : pas de divulgation d'existence de compte via les réponses. Pas de BLOCKER/HIGH.

### `forgotPassword` — réponse **constante** (anti-énumération)

- L'envoi d'email n'a lieu que si `user && user.actif !== false && user.password`
  (`:9073`), **mais** la procédure renvoie **toujours `{ success: true }`** (`:9124`,
  commentaire « Reponse constante : ne jamais reveler l'existence de l'email »).
  → **Impossible** de distinguer un email enregistré d'un inconnu via le **corps** de la
  réponse.

### Token de reset robuste

- `rawToken = randomBytes(32).toString('hex')` (`:9074`) → **256 bits**, non énumérable.
- **Stocké hashé** : `resetToken = SHA-256(rawToken)` (`:9075`) → une fuite DB ne donne pas
  de jeton réutilisable.
- **Expiry 1 h** (`:9076`) ; **usage unique** (le handler `resetPassword` invalide le token
  après application, OPE-8).

### `signin` / `signup`

- `signin` : message **générique** « Invalid email or password » → pas d'énumération.

---

## Réserves LOW

1. **Énumération via `signup`** : `Email already in use` (`CONFLICT`, `:8986`) révèle qu'un
   email **est** enregistré. **Compromis accepté** (il faut bien informer l'utilisateur que
   l'email est pris) — **LOW**, fréquent.
2. **Énumération temporelle de `forgotPassword`** : quand l'email **existe**, la procédure
   fait `randomBytes` + hash + `updateUser` + **`await sendEmail`** → réponse **plus
   lente** que pour un email inconnu (retour immédiat). Un attaquant chronométrant peut
   distinguer → **timing oracle LOW**. Atténuation : envoi d'email **hors du chemin de
   réponse** (fire-and-forget) ou padding constant.

### Écart connu = déjà filé

- `resetUrl` construit depuis `ctx.req.headers.origin` (`:9082`) → **reset poisoning**
  (lien forgé) = issue **déjà filée**. Pas de doublon.

---

## Verdict

Énumération de comptes **neutralisée** sur le vecteur principal : `forgotPassword`
renvoie une **réponse constante**, `signin` un message **générique** ; token de reset
**fort, hashé, expirant, à usage unique**. Résiduels = `signup` (compromis accepté) +
**timing** forgotPassword → **LOW**. Reset-poisoning **déjà filé**. **Pas de nouvelle
issue Linear.**

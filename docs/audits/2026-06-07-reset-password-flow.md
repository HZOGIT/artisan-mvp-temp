# Audit — Flow « mot de passe oublié » (forgotPassword / resetPassword)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : sécurité du flow de réinitialisation (`auth.forgotPassword`
> `routers.ts:9058`, `auth.resetPassword` `:9123`, `getUserByValidResetToken`
> `db.ts`). Implémenté en Sprint 1 (OPE-8) ; ici on audite la **robustesse**
> du mécanisme de token.

---

## Conclusion : le mécanisme de token est solide. Une seule réserve (rate limit).

### Ce qui est correct (sécurité token excellente)

- **Token crypto-sûr** : `randomBytes(32).toString('hex')` (256 bits) — pas de
  `Math.random` (contraste avec OPE-18).
- **Stocké hashé** : seul `sha256(token)` est en base (`resetToken`) ; une fuite
  de la table `users` ne donne **pas** de token utilisable. Le `rawToken` n'existe
  que dans l'email.
- **Expiration courte** : 1 h (`resetTokenExpiry`), **appliquée** côté requête :
  `getUserByValidResetToken` filtre `resetToken = ? AND resetTokenExpiry >= NOW()`.
- **Usage unique** : `resetPassword` met `resetToken=null`, `resetTokenExpiry=null`
  après succès → le lien ne peut pas être rejoué.
- **Anti-énumération** : `forgotPassword` renvoie **toujours** `{ success: true }`,
  qu'il existe un compte ou non — l'existence d'un email n'est jamais révélée.
- **Comptes exclus** : inactifs (`actif === false`) et OAuth-only (`!password`)
  ne reçoivent pas de lien.
- **Erreur générique** côté `resetPassword` (« Lien invalide ou expiré ») sans
  distinguer inexistant/expiré.

---

## 🟡 Réserve (rate limiting) — `forgotPassword` floodable → email bombing / délivrabilité

`forgotPassword` est une `publicProcedure` qui **envoie un email** et n'a
**aucune limite de fréquence** (`grep checkRateLimit` sur le handler → 0). Comme
la réponse est constante, un attaquant qui connaît (ou devine) l'email d'un
utilisateur Operioz peut **boucler l'appel** et :

- **bombarder la boîte mail** de la victime de mails « réinitialisez votre mot de
  passe » (harcèlement) ;
- **consommer le quota/budget d'envoi** et surtout **dégrader la réputation
  d'expédition du domaine** → casse la **délivrabilité de TOUS les emails
  transactionnels** (même risque que OPE-37).

Note : le `checkRateLimit(artisan.id)` existant **n'est pas applicable tel quel**
ici — `forgotPassword` est **pré-auth** (pas de contexte artisan ; l'email peut ne
correspondre à aucun artisan). Il faut une limite par **IP** et/ou par **email
cible** (ex. 3–5 demandes / heure / email, N / heure / IP).

→ **Même classe que OPE-23 (SMS), OPE-36 (submitContact) et OPE-24 (rate limiting
manquant).** Pour éviter un doublon, ce vecteur est **ajouté à OPE-24** par
commentaire plutôt qu'en nouvelle issue.

---

## Autre point (déjà tracé)

- **Sessions non coupées après reset** : le reset ne révoque pas les JWT existants
  (auth stateless 7 j) → si le mot de passe est réinitialisé suite à compromission,
  les sessions de l'attaquant restent valides. **Déjà OPE-32** (sessions JWT non
  révocables). Pas de nouvelle entrée.

---

## Verdict

Flow de réinitialisation **bien conçu** (token 256 bits hashé, expiry 1 h
appliquée, usage unique, anti-énumération). Une réserve : **absence de rate limit
sur `forgotPassword`** (email bombing / délivrabilité) → consolidée dans **OPE-24**.
Pas de nouvelle issue créée.

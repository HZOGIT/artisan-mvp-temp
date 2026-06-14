# Audit — Auth : secret JWT, vérification de token & cookie de session — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `server/_core/auth-simple.ts` (createToken/verifyToken/setAuthCookie/
> clearAuthCookie/getUserFromRequest), `env.ts:11-12/114`, schéma `users.role`
> (`schema.ts:14`). Vecteurs recherchés : secret par défaut/fail-open (cf. OPE-79),
> forge de token, alg confusion, flags cookie, escalade de rôle.

---

## Conclusion : auth de session solide. Pas de BLOCKER/HIGH.

### Secret JWT — fail-closed (contraste sain avec OPE-79)

- `env.ts:12` : `JWT_SECRET: z.string().min(32)` **requis** (validation zod).
- `auth-simple.ts:8-11` : `if (!JWT_SECRET) throw` au chargement → **aucun fallback**
  par défaut, le serveur refuse de démarrer sans secret. (≠ webhook OPE-79 qui passe
  `'' `.)

### Token — signature + expiration

- `createToken` : HS256, `setExpirationTime("7d")`, payload minimal `{userId, email}`
  (pas de données sensibles).
- `verifyToken` : `jwtVerify(token, SECRET_KEY)` → vérifie signature **et** exp ;
  retourne `null` sur erreur. Clé **symétrique** (`TextEncoder`) → jose **rejette**
  `alg: none` et toute confusion RS256→HS256 (pas de clé publique en jeu).

### Cookie de session — flags corrects

`setAuthCookie` (`:48-58`) : `httpOnly: true`, `secure: NODE_ENV==='production'`,
`sameSite: 'lax'`, `maxAge 7j`, `path:/`. → anti-XSS-vol de cookie (httpOnly), HTTPS
en prod, et `sameSite=lax` bloque l'envoi du cookie sur les **POST cross-site**
(mutations tRPC) → CSRF largement atténué.

### Révocation partielle à la désactivation

`getUserFromRequest` (`:111-113`) : un user `actif === false` → `null`. Donc
`utilisateurs.toggleActif(false)` **invalide effectivement** les sessions existantes du
collaborateur au prochain appel (révocation immédiate côté désactivation).

---

## Réserves mineures (non bloquantes, pas d'issue)

1. **`role: user.role || "admin"` (`:135`) — footgun latent non exploitable.** Défauter
   un rôle inconnu vers **admin** est à l'envers (devrait être least-privilege). Mais
   `users.role` est `mysqlEnum([...]).default("artisan").notNull()` (`schema.ts:14`) →
   **jamais null/vide** → la branche `|| "admin"` est **inatteignable** sous les
   contraintes DB. Reco défense-en-profondeur : remplacer par `|| "technicien"` (ou
   rejeter), pour éviter une escalade si la contrainte sautait un jour (migration).
2. **`jwtVerify` sans `algorithms` épinglé** : non exploitable ici (clé symétrique ⇒
   seuls les HMAC possibles), mais épingler `{ algorithms: ['HS256'] }` est une bonne
   pratique de durcissement.
3. **Révocation sur changement de mot de passe / logout** : déjà tracée par **OPE-32**
   (JWT stateless 7 j sans `jti`/`passwordChangedAt` → un token volé reste valide après
   reset/logout). La désactivation, elle, est bien prise en compte (cf. ci-dessus).

---

## Verdict

Auth de session **bien construite** : secret JWT **fail-closed** (≠ OPE-79), token
signé+expirant, cookie `httpOnly`/`secure`(prod)/`sameSite=lax`, blocage des comptes
désactivés. Réserves défense-en-profondeur (`role || "admin"` inatteignable, épingler
l'algo) ; la non-révocation sur reset/logout est déjà **OPE-32**. **Pas d'issue Linear.**

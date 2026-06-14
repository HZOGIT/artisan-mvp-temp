# Audit — Auth core : hachage mot de passe, JWT, cookie, signin — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `auth.ts` (bcrypt), `auth-simple.ts` (JWT + cookie +
> `getUserFromRequest`), `auth.signin` (`routers.ts:8983`), `requirePermission`
> (`trpc.ts`). Hors périmètre : révocation de session (OPE-32), mot de passe
> temporaire (OPE-18), flow reset (audité le 2026-06-07).

---

## Conclusion : socle d'authentification sain. Pas de BLOCKER/HIGH.

### Hachage — robuste

- **bcrypt** (`bcryptjs`), `genSalt(10)` → coût 10 (standard). `verifyPassword`
  = `bcrypt.compare` (**comparaison à temps constant**). Pas de SHA brut, pas de
  `Math.random` ici.

### JWT / cookie — corrects

- JWT **HS256**, expiry **7 j**, `JWT_SECRET` **obligatoire** (throw au boot si
  absent).
- Cookie : `httpOnly` ✓, `secure` en prod ✓, `sameSite='lax'` ✓ (anti-CSRF
  raisonnable sur les POST cross-site), `maxAge` 7 j, `path=/`.
- `getUserFromRequest` : vérifie le JWT, recharge le user en base, **bloque les
  comptes inactifs** (`actif === false` → null), recharge les permissions
  (admin = `ALL_PERMISSIONS`, sinon depuis `permissions_utilisateur`).

### Signin — correct

- `authenticateUser` + **message d'erreur uniforme** (« Invalid email or
  password ») → pas de révélation email via le message.
- **Rate limit** signin/signup : 5 tentatives / 15 min / IP (`index.ts:192`).
- Self-heal OPE-7 idempotent, déclenché **uniquement** pour les propriétaires
  (`!dbUser.artisanId`) — les collaborateurs ont toujours `artisanId` renseigné.

---

## ⚠️ Recommandation de durcissement (défense en profondeur) — `role || "admin"`

`getUserFromRequest` retourne `role: user.role || "admin"` (`auth-simple.ts:135`)
et `requirePermission` **bypass total si `ctx.user.role === "admin"`**
(`trpc.ts`). Le repli par défaut est donc le **privilège le plus élevé**.

**Non exploitable en l'état** : la colonne `users.role` est
`mysqlEnum(...).default("artisan").notNull()` (`schema.ts`) et tous les chemins
d'écriture passent une valeur d'enum validée (`updateUserRole` est appelé via
`utilisateurs.updateRole` qui valide `z.enum([...])`) → `user.role` n'est jamais
NULL/vide, le `|| "admin"` ne se déclenche jamais.

**Mais c'est un fail-open dangereux** : si un jour la colonne devenait nullable,
une migration bancale ou une écriture ENUM invalide en mode SQL non-strict
(stockage `''`) produirait un `role` vide → **admin silencieux** (bypass de
**toutes** les permissions). Recommandation : **fail closed** — repli sur le rôle
**le moins privilégié** (`'technicien'`) ou rejet explicite, jamais `'admin'`.
Footgun latent, **pas un blocker** (non atteignable aujourd'hui).

## Réserves mineures

- **Timing d'énumération signin** : `authenticateUser` saute probablement bcrypt
  pour un email inconnu (retour rapide) vs ~100 ms si l'email existe → oracle
  faible. Atténué par le message uniforme + le rate limit 5/15 min/IP. Faible.
- Révocation de session (JWT stateless 7 j) → **OPE-32**. Mot de passe temporaire
  `Math.random` → **OPE-18**.

---

## Verdict

Auth **solide** : bcrypt(10) + compare constant-time, JWT HS256 secret obligatoire,
cookie httpOnly/secure/lax, comptes inactifs bloqués, signin uniforme + rate-limité.
Seule recommandation notable : **faire échouer `role` vers le moindre privilège**
plutôt que `'admin'` (footgun latent, non exploitable). **Pas d'issue Linear
créée.**

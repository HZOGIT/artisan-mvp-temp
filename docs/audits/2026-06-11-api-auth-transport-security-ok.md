# Audit — Sécurité transport API / Auth (cookies, JWT, en-têtes, CORS/CSRF) : OK (1 réserve LOW)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `server/_core/index.ts` (middlewares : headers, CORS, body, rate-limit) +
> `server/_core/auth-simple.ts` (JWT, cookie, résolution user) + `server/_core/trpc.ts`
> (`adminOnlyProcedure`/`requireRole`).

---

## Conclusion : couche transport/auth **solide**. Aucun BLOCKER/HIGH. 1 réserve **LOW** (fallback de rôle défensif mal orienté, non exploitable en l'état).

### ✅ Cookie de session correctement durci

`setAuthCookie` (`auth-simple.ts:51`) : **`httpOnly: true`** (pas de vol via XSS),
**`secure: isProduction`** (HTTPS only en prod), **`sameSite: "lax"`**, `maxAge` 7 j, `path:"/"`.
`clearAuthCookie` réutilise les mêmes attributs (suppression effective).

### ✅ JWT robuste

- `JWT_SECRET` **obligatoire** : l'app **throw au boot** si absent (`auth-simple.ts:9-11`) → pas
  de secret par défaut faible. HS256, expiration **7 j** (`createToken`), vérifié via `jose`
  (`jwtVerify`) avec gestion d'erreur → token invalide ⇒ `null`.
- `getUserFromRequest` (`:77`) recharge **à chaque requête** le `role`, les `permissions`
  (depuis `permissions_utilisateur`) et le flag **`actif`** depuis la DB — le JWT ne porte que
  `userId`/`email`. Conséquence : une **désactivation** de compte (`actif=false`) ou un
  **changement de permissions** prend effet **immédiatement** (pas besoin d'attendre l'expiry).
  → atténue partiellement **OPE-32** (JWT non révocable) pour les cas désactivation/permissions.

### ✅ En-têtes de sécurité présents

`index.ts:196-201` : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Strict-Transport-Security` (1 an + subdomains), `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (camera désactivée, micro/géoloc = self). **CSP désactivée** (commentée
`:153-154`) = **OPE-48 connu** (non ré-activée car risque front) → pas de doublon.

### ✅ CORS / CSRF

- **Aucun `cors()` permissif** (pas de `Access-Control-Allow-Origin: *` + `credentials`).
  L'API tRPC est same-origin.
- **CSRF** : l'auth est par **cookie**, mais `sameSite: "lax"` **bloque l'envoi du cookie sur
  les POST cross-site** → les mutations tRPC (POST) ne sont pas déclenchables en CSRF classique.
  Pas de formulaire HTML state-changing hors tRPC. → posture CSRF **correcte** pour le MVP.

### ✅ Rôle d'invitation contraint

`utilisateurs.invite` (`routers.ts:7918,7974`) : `role: z.enum(["artisan","secretaire","technicien"])`
→ **impossible d'inviter un `admin`**. Signup (`:9275`) crée l'owner via la valeur **par défaut
de la colonne** (`role` enum `.default("artisan").notNull()`) → jamais `admin`.

---

## 🟡 Réserve LOW — fallback de rôle orienté « admin »

`getUserFromRequest` retourne `role: user.role || "admin"` (`auth-simple.ts:135`). Le fallback
**par défaut vers `admin`** est un **mauvais sens** (un défaut de sécurité devrait viser le
**moindre privilège**). `adminOnlyProcedure` (`trpc.ts:34,61`) et `requireRole` (`:53`) se fient
à `ctx.user.role` → un objet user au `role` vide obtiendrait un rôle `admin`.

**Pourquoi ce n'est PAS un BLOCKER/HIGH aujourd'hui** : la colonne `users.role` est
**`mysqlEnum(...).default("artisan").notNull()`** → en pratique `user.role` est **toujours**
l'une des 4 valeurs valides ; le `|| "admin"` est **du code mort** (jamais atteint). Aucun
chemin de création d'utilisateur ne produit de `role` nul (invite contraint, signup = défaut
`artisan`, raw SQL hériterait du défaut). → **non exploitable**, donc **LOW**, sous le seuil.

**Reco (durcissement, candidat auto-fix safe / behavior-preserving)** : remplacer le défaut
par le **moindre privilège** (`role: user.role || "technicien"`) ou, mieux, **rejeter** (`return
null`) si `user.role` est absent. Comme `user.role` n'est jamais nul en pratique, le changement
est un **no-op fonctionnel** (sortie identique) mais supprime le footgun si le schéma évoluait.

---

## Verdict

La couche **transport/auth** est **solide** : cookie `httpOnly/secure/sameSite`, JWT signé +
secret obligatoire + rechargement DB du rôle/permissions/`actif` à chaque requête, en-têtes de
sécurité complets, pas de CORS permissif, CSRF couvert par `sameSite=lax`. **Aucun BLOCKER/HIGH.**
Une **réserve LOW** (fallback `role || "admin"`, non exploitable car colonne NOT NULL/défaut
`artisan`) → **pas de nouvelle issue Linear** ; durcissement d'une ligne recommandé (moindre
privilège). CSP = OPE-48, JWT non révocable = OPE-32 (déjà filés).

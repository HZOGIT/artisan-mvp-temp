# Audit — Onboarding artisan (signup → provisioning) : OK (réserves LOW)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `auth.signup` (`routers.ts:9328`) + `createUserWithPassword`
> (`server/_core/auth.ts:24`) + `bootstrapArtisanAccount` (`server/db.ts:3498`) +
> middleware rate-limit auth (`server/_core/index.ts:213`).

---

## Conclusion : flux d'inscription **solide et complet**. Aucun BLOCKER/HIGH. 3 réserves **LOW** (vérification email, échappement nom dans l'email de bienvenue, force du mot de passe).

### ✅ Provisioning complet et idempotent (OPE-7 résolu)

`bootstrapArtisanAccount` (`db.ts:3498`) :
1. Crée la ligne `artisans` via `getOrCreateArtisan` (**idempotent**, `UNIQUE(userId)`).
2. Lie `users.artisanId` au propre artisan (requis par `subscriptionRouter` /
   `setUserPermissions`).
3. Sème une **subscription d'essai 14 j** (`status: trialing`, `maxUsers: 1`)
   **seulement si absente**.
4. Sème les **permissions propriétaire** (`ALL_PERMISSIONS`) **seulement si aucune
   présente**.

Chaque étape est conditionnelle (`if absent`) → **ré-exécutable sans effet de bord**
(double-appel safe). Les étapes 3/4 sont en `try/catch` non bloquant.

### ✅ Unicité d'email garantie au niveau DB (pas de doublon)

`createUserWithPassword` (`auth.ts:24`) vérifie l'email existant **et** la colonne
`users.email` est `varchar(320).unique()` (`schema.ts`). Le check applicatif est un
read-then-insert (TOCTOU), mais la **contrainte UNIQUE MySQL** rattrape toute course
concurrente → l'insert dupliqué échoue (capté par le `try/catch` du signup). **Pas de
comptes en double.** Mot de passe **hashé** (`hashPassword`) avant insertion.

### ✅ Rate-limit signup (anti mass-account / coûts email)

Le middleware `/api/trpc` (`index.ts:213-242`) borne **`auth.signin` ET `auth.signup`**
à **5 tentatives / 15 min / IP**, IP via **`CF-Connecting-IP`** (non falsifiable,
OPE-80). → un bot ne peut pas créer des comptes en masse (chaque signup déclenche un
email de bienvenue + une subscription d'essai). L'email de bienvenue est **best-effort**
(`try/catch`, n'échoue pas si Resend indisponible).

---

## 🟡 Réserves LOW (sous le seuil BLOCKER/HIGH, pas d'issue Linear)

1. **Pas de vérification d'email** : le compte est provisionné **et connecté
   immédiatement** (cookie posé) sur un email **non vérifié** (`signup` →
   `setAuthCookie` directement). Quelqu'un peut s'inscrire avec l'email d'un tiers
   (qui reçoit alors un « Bienvenue »). **Acceptable pour un MVP** (vérification
   différée possible) ; à durcir si abus constaté. Décision **produit** (ajoute de la
   friction) → hors auto-fix.
2. **Nom non échappé dans l'email de bienvenue** (`routers.ts:9356`) :
   `Bonjour${input.name ...}` interpolé **sans `safeHtml`**. **Self-XSS uniquement**
   (le signataire contrôle son propre nom et reçoit son propre email) → **non
   exploitable** contre un tiers. Cohérence : à wrapper dans `safeHtml` (même classe
   qu'OPE-59) → **candidat auto-fix safe**.
3. **Force du mot de passe** : `password: z.string().min(6)` — minimum faible (6
   caractères). Relever à 8+ serait un durcissement behavior-preserving pour les
   nouveaux comptes (n'affecte pas les existants).

### Écarts connus — déjà filés (pas de doublon)

- Farming d'essais via ré-inscription (nouvel email = nouvel essai) → **OPE-66**
  (`trial_period_days` inconditionnel) / OPE-75.
- Sièges `maxUsers` non appliqués → **OPE-65**.

---

## Verdict

L'onboarding artisan est **complet, idempotent et protégé** : provisioning intégral
(artisan + lien user + essai + permissions), **unicité email garantie en DB**,
**rate-limit signup 5/15min/IP** (CF-Connecting-IP). **Aucun BLOCKER/HIGH.** Trois
réserves **LOW** (vérification email = décision produit ; nom non échappé dans l'email
de bienvenue = self-XSS, candidat auto-fix OPE-59 ; mot de passe min 6). **Pas de
nouvelle issue Linear.**

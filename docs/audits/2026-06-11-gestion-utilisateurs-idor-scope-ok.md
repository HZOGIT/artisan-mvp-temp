# Audit — Gestion des utilisateurs (invite/rôles/permissions) : cloisonnement OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `utilisateursRouter` (`routers.ts:7590-7720`) + helpers DB
> `updateUserRole` / `toggleUserActif` / `setUserPermissions` (`db.ts:3315-3365`).

---

## Conclusion : pas d'IDOR cross-tenant. Les écarts connus mappent sur des issues existantes. Pas de NOUVEAU BLOCKER/HIGH.

### ✅ Cloisonnement multi-tenant correct (pas d'IDOR)

Toutes les mutations sont **gated** par `utilisateursGererProcedure` (permission
`utilisateurs:gerer`) ET re-scopées en base sur `artisanId` :

| Mutation | Garde DB |
| -- | -- |
| `updateRole` → `updateUserRole(userId, role, artisanId)` | `db.ts:3319` `if (!user[0] || user[0].artisanId !== artisanId) return undefined` |
| `toggleActif` → `toggleUserActif(userId, actif, artisanId)` | `db.ts:3329` même garde |
| `updatePermissions`/`resetPermissions` → `setUserPermissions(userId, perms, artisanId)` | `db.ts:3354` `throw` si `user.artisanId !== artisanId` |
| `getPermissions` | `routers.ts:7694` `targetUser.artisanId !== artisan.id && targetUser.id !== artisan.userId` |
| `invite` → `createCollaborator({ artisanId: artisan.id })` | `artisanId` forcé au tenant appelant |

→ Un artisan **ne peut pas** modifier rôle/état/permissions d'un user d'un **autre**
tenant : le `userId` fourni doit appartenir à `artisan.id`. **Pas d'IDOR.**

### 🟡 Écarts connus — déjà filés (anti-doublon : pas de nouvelle issue)

1. **Protection du propriétaire absente** → **OPE-42** (existant). Le propriétaire est
   lui-même un `user` avec `artisanId === artisan.id` (lié par `bootstrapArtisanAccount`,
   `db.ts:3391`). Un collaborateur disposant de `utilisateurs:gerer` peut donc :
   - `updateRole(ownerUserId, "technicien")` → **rétrograder le propriétaire** ;
   - `toggleActif(ownerUserId, false)` → **désactiver le propriétaire** (`getUserFromRequest`
     renvoie `null` si `actif === false` → lock-out) ;
   - `setUserPermissions(ownerUserId, [])` → **vider ses permissions**.
   Aucune garde `userId !== artisan.userId` sur ces mutations. → **OPE-42**.
2. **Mot de passe temporaire `Math.random()`** (`routers.ts:7615`,
   `Math.random().toString(36).slice(-10)`) → non crypto-sûr → **OPE-18** (existant).
3. **Échappement HTML email d'invitation** : `${artisan.nomEntreprise}` interpolé non
   échappé dans le body (`routers.ts:7642`). `nomEntreprise` est contrôlé par le **même
   artisan** qui invite (self-XSS, impact faible) ; `input.email` est `z.string().email()`,
   `role` est un enum. → classe « injection HTML emails » déjà documentée (OPE-12/36/59 +
   [sweep](2026-06-11-injection-html-emails-sweep-incomplet.md)). À traiter via `safeHtml`.

### Note

L'enum de rôle assignable aux collaborateurs est `["artisan","secretaire","technicien"]` —
le rôle `"admin"` (bypass `ALL_PERMISSIONS` dans `auth-simple.ts:117`) **n'est pas
assignable** via ces routes. Le fallback `role: user.role || "admin"` (`auth-simple.ts:135`)
est du code défensif **mort** : `users.role` est `mysqlEnum(...).default("artisan").notNull()`
(`schema.ts:14`) → jamais NULL/vide. Pas d'escalade par ce biais.

---

## Verdict

La gestion des utilisateurs est **correctement cloisonnée par tenant** (gate permission +
re-scope `artisanId` côté DB sur les 3 helpers) → **pas d'IDOR, pas de nouveau BLOCKER**.
Les écarts (protection propriétaire, mot de passe `Math.random`, échappement email) sont
**déjà couverts** par OPE-42 / OPE-18 / classe injection HTML emails. **Pas de nouvelle
issue Linear.**

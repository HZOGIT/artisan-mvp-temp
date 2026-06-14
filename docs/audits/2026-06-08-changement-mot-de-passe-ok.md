# Audit — Changement / réinitialisation de mot de passe (connecté) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : tous les chemins d'écriture du `password` — `auth.updatePassword`
> (`routers.ts:9032`), `auth.resetPassword` (`:9123`), création de compte
> (`auth.ts:49`). Complète l'audit reset (2026-06-07).

---

## Conclusion : surface mot de passe **saine**. Pas de BLOCKER/HIGH.

### `updatePassword` (connecté) — exige et vérifie le mot de passe actuel

```typescript
// routers.ts:9032-9049
.input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) }))
const ok = await verifyPassword(input.currentPassword, user.password);
if (!ok) throw UNAUTHORIZED("Mot de passe actuel incorrect");
const hashed = await hashPassword(input.newPassword);
await db.updateUser(ctx.user.id, { password: hashed });
```

→ Une **session détournée** (JWT volé, XSS) **ne peut pas** changer le mot de passe
sans connaître l'actuel → pas de prise de contrôle / verrouillage du compte par ce
biais. ✓ (bcrypt `verifyPassword`, cf. audit auth.)

### Les 3 — et seuls — chemins d'écriture du password sont gardés

| Chemin | Garde |
| -- | -- |
| `auth.ts:49` (création signup / collaborateur) | création — pas de garde requise |
| `updatePassword` (`:9048`) | **mot de passe actuel vérifié** ✓ |
| `resetPassword` (`:9136`) | **token de reset vérifié** (`getUserByValidResetToken`, token 256 bits hashé, expiry 1h) ✓ |

`grep` exhaustif des écritures `password:` → aucun chemin non gardé (pas de
« set password » sans vérification d'identité). ✓

---

## Réserves (déjà tracées)

- **Sessions non révoquées** après changement/reset (JWT stateless 7 j, pas de
  `passwordChangedAt`) → un JWT volé survit au changement de mot de passe →
  **OPE-32**.
- **Politique de mot de passe faible** : `newPassword.min(6)` (idem signup) — pas
  de complexité requise. Mineur.
- **Mot de passe temporaire** collaborateur (`Math.random`, jamais forcé à
  changer) → **OPE-18**.
- **`forgotPassword` sans rate limit** → **OPE-24** (vecteur 4).

---

## Verdict

Gestion du mot de passe **correcte** : changement protégé par le mot de passe
actuel, reset protégé par token sécurisé, création au signup — aucun chemin
d'écriture non gardé. Réserves (révocation de session, force du mot de passe, temp
pw, rate limit reset) **toutes déjà filées** (OPE-32/18/24). **Pas d'issue Linear.**

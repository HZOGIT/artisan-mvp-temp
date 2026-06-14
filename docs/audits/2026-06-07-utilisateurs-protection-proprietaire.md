# Audit — Gestion des utilisateurs : protection du compte propriétaire

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `utilisateursRouter` (`routers.ts:7557+`) — invite, updateRole,
> toggleActif, updatePermissions, resetPermissions. Distinct d'OPE-17 (guards de
> rôle) et OPE-18 (mot de passe temporaire `Math.random`).

---

## Ce qui fonctionne correctement

- Toutes les routes sont sous `utilisateursGererProcedure` (permission
  `utilisateurs.gerer`, que seul le propriétaire détient par défaut). ✓
- **Pas de cross-tenant** : les helpers `updateUserRole`/`toggleUserActif`/
  `setUserPermissions` filtrent sur `user.artisanId === artisanId` → impossible
  d'agir sur un utilisateur d'une autre entreprise. ✓
- **Pas d'escalade vers `admin`** (plateforme) : les enums `updateRole`/`invite`
  sont limités à `{artisan, secretaire, technicien}`. ✓
- `updatePermissions` filtre les permissions reçues contre `ALL_PERMISSIONS`. ✓

---

## 🟠 HIGH — Aucune protection du compte propriétaire : un collaborateur `utilisateurs.gerer` peut verrouiller le propriétaire hors de son compte

### Problème

`updateRole` (`routers.ts:7626`) et `toggleActif` (`:7642`) ne vérifient **que**
l'appartenance à l'entreprise — **aucune protection du propriétaire** du compte
(`artisan.userId`) :

```typescript
// db.ts — updateUserRole / toggleUserActif
const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
if (!user[0] || user[0].artisanId !== artisanId) return undefined;   // ← seul check
await db.update(users).set({ role }) / .set({ actif }) ...
```

Il n'existe nulle part d'invariant « le propriétaire ne peut pas être
modifié/désactivé par un collaborateur » (`grep isOwner|dernier admin|cannot
remove` → 0).

### Interaction avec OPE-7 (à signaler)

Avant OPE-7, le `users.artisanId` du propriétaire était **NULL** → les helpers
filtrés `WHERE artisanId = ?` ne le matchaient pas, ce qui le **protégeait par
accident**. Le fix OPE-7 (provisionnement du compte) **lie désormais le
propriétaire à sa propre entreprise** (`users.artisanId = artisan.id`,
`db.ts:3377`) — ce qui le rend **ciblable** par `updateRole`/`toggleActif`. Le
correctif d'OPE-7 a donc élargi cette surface ; il faut ajouter la protection
explicite du propriétaire.

### Exploitation

Précondition : le propriétaire a délégué `utilisateurs.gerer` à un collaborateur
(action normale : responsable de bureau / secrétaire promu). Ce collaborateur
peut alors :

- **`toggleActif(ownerUserId, false)`** → `actif=false` → `getUserFromRequest`
  rejette le propriétaire → **propriétaire déconnecté et incapable de se
  reconnecter**.
- **`updateRole(ownerUserId, 'technicien')`** → rétrograde le propriétaire +
  **réinitialise ses permissions aux valeurs `technicien`** (`:7637-7638`) → il
  perd `utilisateurs.gerer`, factures, compta… et **ne peut plus se les
  re-attribuer** (la route exige `utilisateurs.gerer` qu'il n'a plus).

Résultat : **prise de contrôle / verrouillage du compte par un sous-utilisateur**,
réparable uniquement par intervention manuelle en base. Le propriétaire reste
« propriétaire » au sens `artisans.userId`, mais perd tout accès fonctionnel
(les guards de permission lisent `permissions_utilisateur`).

### Fix proposé

Protéger le propriétaire dans les 4 mutations (refuser de cibler
`artisan.userId` sauf si l'appelant EST le propriétaire) :

```typescript
const artisan = await db.getArtisanByUserId(ctx.user.id);
if (input.userId === artisan.userId) {
  throw new TRPCError({ code: "FORBIDDEN",
    message: "Le compte propriétaire ne peut pas être modifié par un collaborateur." });
}
```
(idéalement : concept explicite de rôle « propriétaire » immuable + interdiction
de désactiver le dernier compte disposant de `utilisateurs.gerer`.)

### Estimation

~1 h — garde propriétaire sur updateRole/toggleActif/updatePermissions/
resetPermissions + test.

---

## Estimation totale

- HIGH (protection du compte propriétaire) : ~1 h

# Audit — Gestion utilisateurs : isolation tenant des rôles/permissions — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `utilisateursRouter` (`routers.ts:7566-7702`) — `list`, `create`,
> `updateRole`, `toggleActif`, `getPermissions`, `updatePermissions`, `resetPermissions` ;
> garde `utilisateursGererProcedure` ; `ROLE_TEMPLATES` (`shared/permissions.ts:90-110`) ;
> fonctions DB `setUserPermissions`/`updateUserRole`/`toggleUserActif` ;
> `bootstrapArtisanAccount` (`db.ts`).

---

## Conclusion : isolation tenant **systématique**, pas de privilege-escalation cross-tenant. Pas de BLOCKER/HIGH nouveau.

### 1) Toutes les mutations vérifient l'appartenance au tenant — **au niveau DB**

Le point sensible : `updatePermissions` (`:7677`) ne re-vérifie **pas** le tenant dans le
routeur (contrairement à `getPermissions`/`resetPermissions` qui font le check
explicitement). Mais la défense est **dans la fonction DB** :

```typescript
// db.ts setUserPermissions / updateUserRole / toggleUserActif
const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
if (!user[0] || user[0].artisanId !== artisanId) throw / return undefined;
```

→ Un manager du tenant A qui cible le `userId` d'un user du tenant B est **rejeté**
(« Utilisateur non trouvé dans votre entreprise »). **Pas d'IDOR cross-tenant** sur
les rôles/permissions/activation, malgré l'absence de check routeur sur `updatePermissions`
(la garde DB est la source de vérité, defense-in-depth correcte).

### 2) Pas d'injection de permission arbitraire

`updatePermissions` filtre : `validPerms = input.permissions.filter(p =>
ALL_PERMISSIONS.includes(p))` (`:7685`) → impossible de poser une permission inexistante /
forgée. Les rôles sont bornés par `z.enum(["artisan","secretaire","technicien"])`.

### 3) Modèle de rôles cohérent — pas de lock-out du propriétaire

- `ROLE_TEMPLATES.artisan` **exclut** `utilisateurs.gerer` ; seul `admin` l'a par template
  (`permissions.ts:96`). On pourrait croire que le propriétaire (rôle `artisan`) est
  privé de gestion d'utilisateurs.
- **Mais** `bootstrapArtisanAccount` provisionne le propriétaire avec
  **`[...ALL_PERMISSIONS]`** (commentaire « Permissions du proprietaire = TOUTES (y
  compris utilisateurs.gerer) », `setUserPermissions(userId, [...ALL_PERMISSIONS], …)`).
  → Le propriétaire **a** `utilisateurs.gerer` quel que soit son `role`. Pas de lock-out.
- Les templates ne servent que de **défauts** pour les collaborateurs ; ni `secretaire` ni
  `technicien` n'obtiennent `utilisateurs.gerer` par défaut → l'accès à
  `utilisateursGererProcedure` exige une délégation **explicite** par le propriétaire.

---

## Écart connu = protection du propriétaire, **déjà filé**

Aucune garde n'empêche un collaborateur **explicitement** doté de `utilisateurs.gerer` de
**rétrograder/désactiver/dé-permissionner le propriétaire** (`updateRole`, `toggleActif`,
`updatePermissions(owner, [])`) → verrouillage du compte. C'est exactement **« Gestion
utilisateurs : aucune protection du propriétaire »** (déjà filé). L'auto-escalade d'un
manager délégué (se grant des permissions) relève du **même périmètre de confiance**
`utilisateurs.gerer` → pas de doublon, pas de nouvelle issue.

---

## Verdict

Rôles/permissions : **isolation tenant appliquée en DB** sur 100 % des mutations (rejet du
`userId` cross-tenant), **permissions filtrées** par `ALL_PERMISSIONS`, propriétaire doté
de toutes les permissions au bootstrap (pas de lock-out). Seul écart = **protection du
propriétaire** (déjà filé). **Pas de nouvelle issue Linear.**

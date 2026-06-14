# Audit — Invitation collaborateurs : la limite de sièges (`maxUsers`) n'est jamais appliquée

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `utilisateurs.invite` (`routers.ts:7568`) vs. les quotas de sièges
> par plan (`PLAN_LIMITS`, `db.ts:3966`) et la facturation par siège
> (`STRIPE_PRICE_EXTRA_USER_*`). Distinct d'OPE-43 (gating **modules**), OPE-28
> (dérivation du plan), OPE-64 (statut past_due) et OPE-42 (protection owner).

---

## Ce qui fonctionne correctement

- `invite` est bien gardé par `utilisateursGererProcedure` (permission) et scope
  l'entreprise via `getArtisanByUserId`.
- `setUserPermissions` **vérifie l'appartenance** du user cible à l'entreprise
  (`db.ts` : `user.artisanId !== artisanId` ⇒ throw) → pas d'IDOR sur
  `updatePermissions`.
- Refus si email déjà utilisé (`CONFLICT`).

---

## 🟠 HIGH — Sièges illimités gratuits : `invite` ne contrôle pas `maxUsers` → modèle par siège contourné

### Problème

Les plans définissent un **nombre de sièges** et les sièges supplémentaires sont
**facturés** :

```typescript
// db.ts:3966 PLAN_LIMITS
trial:      { maxUsers: 1,  ... }
essentiel:  { maxUsers: 1,  ... }   // solo : 0 collaborateur inclus
pro:        { maxUsers: 3,  ... }
entreprise: { maxUsers: 10, ... }
// + sièges payants : STRIPE_PRICE_EXTRA_USER_PRO_* / _ENT_* (routers.ts:8195)
// webhook : maxUsers = limits.maxUsers + extraUsers (achetés)
```

Mais `utilisateurs.invite` **crée le collaborateur sans jamais comparer le nombre
d'utilisateurs actuels à `sub.maxUsers`** :

```typescript
// routers.ts:7575-7592 (invite) — aucun check de quota
const artisan = await db.getArtisanByUserId(ctx.user.id);
const existing = await db.getUserByEmail(input.email);
if (existing) throw CONFLICT;
const tempPassword = ...;
const newUser = await db.createCollaborator({ ... artisanId: artisan.id, ... });
// ← aucun appel à getSubscription / countUsers / maxUsers
```

`grep maxUsers server/` : la valeur n'est **lue que pour l'affichage**
(`subscription.getCurrent`, `routers.ts:8159`) et pour le seed du trial. **Aucun
chemin ne l'utilise pour bloquer une création d'utilisateur.** Le
`subscriptionGuard` n'applique que `maxDevicesPerUser` et
`maxConcurrentSessions` — **pas** `maxUsers`. Les collaborateurs en excès peuvent
se connecter et utiliser l'app normalement.

### Impact

**Fuite de revenu / contournement de la tarification par siège :**

- Un artisan **Essentiel** (1 siège, 0 collaborateur inclus) peut inviter un
  nombre **illimité** de `secretaire`/`technicien` gratuitement.
- Un **Pro** (3 sièges) peut dépasser 3 sans acheter de siège supplémentaire.
- Les SKUs `STRIPE_PRICE_EXTRA_USER_*` (sièges payants) deviennent **inutiles** :
  personne n'a besoin de les acheter puisque l'invitation ne vérifie rien.

C'est le **seul point de création** de collaborateurs (`createCollaborator`), donc
le quota n'est appliqué **nulle part**.

### Fix proposé

Dans `invite`, avant `createCollaborator` :

```typescript
const sub = await db.getSubscription(artisan.id);
const activeUsers = (await db.getUsersByArtisanId(artisan.id))
  .filter(u => u.actif !== false).length;
const maxUsers = sub?.maxUsers ?? 1;
if (activeUsers >= maxUsers) {
  throw new TRPCError({ code: "FORBIDDEN",
    message: `Votre plan inclut ${maxUsers} utilisateur(s). Ajoutez des sièges ou passez à un plan supérieur pour inviter davantage de collaborateurs.` });
}
```

(+ idéalement re-vérifier le quota lors de la **réactivation** via `toggleActif`,
pour éviter de désactiver/réactiver afin de dépasser la limite.)

### Estimation

~0,5 j — check quota dans `invite` (+ `toggleActif` réactivation) + message UX + test.

---

## Note secondaire (mineure) — mot de passe temporaire jamais forcé à être changé

`invite` génère un `tempPassword` via `Math.random()` (déjà **OPE-18** pour le
volet crypto) et l'envoie **en clair** par email, **sans `mustChangePassword`** :
le mot de passe temporaire reste valable indéfiniment (l'email se contente de
« changez-le dès que possible »). À traiter avec OPE-18 (ajouter un flag de
changement forcé au premier login). Pas d'issue séparée.

---

## Estimation totale

- HIGH (quota `maxUsers` non appliqué à l'invitation) : ~0,5 j

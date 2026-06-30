# OPE-894 — Self-healing backfill des permissions par rôle (SPIKE / design)

> **Statut : proposition → `Awaiting Human Validation`.** Aucune implémentation. RISQUÉ (authz +
> registre central `permissions.ts` + effet bootstrap-wide). Parent : OPE-879 (self-healing par module).

## 1. Problème

Ajouter une `PermissionCode` au registre central (`packages/contract/permissions.ts`, table
`ROLE_TEMPLATES`) **ne la propage pas** aux utilisateurs déjà créés. Les permissions sont
**matérialisées en lignes** dans `permissions_utilisateur` **au moment du seed** (invitation /
changement de rôle / réinitialisation), jamais re-dérivées. Conséquence : un collaborateur invité
avant l'ajout d'un code que son rôle accorde par défaut **ne l'aura jamais** → désync silencieuse,
permission « manquante » sans erreur.

## 2. État réel du code (vérifié)

| Élément | Constat |
|---|---|
| **Source de vérité rôle→défauts** | `ROLE_TEMPLATES` (`packages/contract/permissions.ts`). **Déjà** partagée par `inviterUtilisateur`, `changerRole`, `reinitialiserPermissions`, `lirePermissions` (`utilisateurs/application/use-cases.ts`). Mapping canonique unique — rien à dupliquer. |
| **Écriture** | `setPermissions(ctx, userId, perms)` = `DELETE` toutes les lignes du user **puis** `INSERT` uniquement des lignes `autorise = true`. La table ne contient en pratique **que des grants** (`autorise=true`). |
| **Colonne `autorise`** | Existe (`boolean DEFAULT true`), `UNIQUE(userId, permission)` posée (20260629164906). **Actuellement morte** : jamais écrite à `false`. |
| **Lecture** | `DrizzlePermissionsReader.getPermissions(userId)` → lignes `autorise=true`. **Ne connaît pas** `ROLE_TEMPLATES`. |
| **Owner** | `isOwner = (artisans.userId === userId)`. Le seam `permissionProcedure` **bypass total** si `isOwner` (`trpc.ts:168`). L'owner n'a **pas besoin de lignes**. |
| **RLS** | `permissions_utilisateur` est **RLS entièrement désactivée** (`disable row level security`, 20260629222008 — lue pré-tenant par `userId`). `users` lue pré-tenant par `getRole(userId)` (`role-reader.ts`) → scan cross-tenant `users.role`/`users.artisanId` possible sous **app_tenant**. |
| **Infra reconciler** | `runReconciler(db, detect, heal, verify, opts)` (OPE-885, mergé) : dry-run par défaut, healing event atomique dans `event_outbox`, circuit-breaker `seuil=50`, `JobDefinition { name, periodKey, run }` registré dans `app.ts` → `schedulerPlugin.configure`. Pattern healing existant armé en **dry-run d'abord**. |

## 3. Le vrai obstacle : « absence de ligne » est ambigu

`setPermissions` n'écrit **que** des `autorise=true`. Donc **un retrait manuel** (l'admin a enlevé à
ce user une permission que son rôle donne, via `definirPermissions`) = **ligne absente**, exactement
comme **un code jamais reçu** (nouveau au registre).

> **Un backfill naïf « le rôle accorde X ET pas de ligne X → INSERT X » re-accorderait silencieusement
> les permissions que l'admin a délibérément retirées.** C'est une **régression authz**, précisément la
> catégorie que la porte de validation humaine protège.

Il **n'existe aujourd'hui aucun discriminant** entre « nouveau » et « retiré ». Toute solution doit en
créer un. Le discriminant naturel est **déjà dans le schéma** : la colonne `autorise`, morte
aujourd'hui. `autorise=false` = *refus délibéré* ; *ligne absente* = *jamais vu* = backfillable.

## 4. Options

### Option A — Dériver les défauts du rôle à la lecture *(recommandée, la plus YAGNI)*

Ne plus **matérialiser** les défauts de rôle. La table ne stocke que des **deltas** : `autorise=true`
= grant *en plus* du rôle, `autorise=false` = retrait *d'un défaut* du rôle. Permissions effectives
**dérivées à la lecture** :

```
effectives(user) = ROLE_TEMPLATES[role]
                 ∪ { grants    autorise=true }
                 − { retraits  autorise=false }
```

Un seul point à changer : `DrizzlePermissionsReader.getPermissions` lit le rôle + les deltas et
calcule. `definirPermissions`/`reinitialiser`/`changerRole` stockent le **delta** vs `ROLE_TEMPLATES`
(plus le `DELETE+INSERT` plein).

- ✅ **La classe de bug disparaît structurellement** : ajouter un code au registre s'applique
  *immédiatement* à tous les users du rôle, sans job, sans cron, sans reconciler. « Source de vérité
  unique » = le registre, *vivant*.
- ✅ Owner inchangé (bypass total, zéro ligne).
- ✅ RLS inchangée (le reader lit déjà pré-tenant).
- ⚠️ Change la sémantique de `getPermissions` + des 3 mutations d'écriture (deltas). Touche un chemin
  authz → tests L1/L2/L3 à reprendre.
- ⚠️ **Dépend du one-time §5** : les retraits historiques ne sont pas enregistrés ; sans migration de
  bascule, basculer le reader **re-accorderait** les défauts aujourd'hui absents.

### Option B — Reconciler de backfill *(ce que le ticket demandait de scoper ; fallback)*

Garder la matérialisation, réutiliser `runReconciler` :

- **detect()** : users (cross-tenant, `users` sous app_tenant) où `ROLE_TEMPLATES[role]` contient X,
  **aucune ligne X** (ni `true` ni `false`), `isOwner=false`. Fenêtré, `LIMIT`.
- **heal(tx)** : `INSERT … autorise=true … ON CONFLICT DO NOTHING` (la contrainte UNIQUE rend
  idempotent). Forward-fix only.
- **verify(tx)** : la ligne existe.
- `dryRun:true` d'abord (observer les healing events `healing.permissions.role-default-manquant`),
  armer ensuite — comme le healing outbox existant.

- ✅ S'appuie sur l'infra OPE-885, schéma inchangé.
- ❌ **Ne résout pas les users hérités** : sans le discriminant `autorise=false`, on ne peut pas
  distinguer retrait vs nouveau → le reconciler ne peut agir *sûrement* que sur les users seedés
  **après** l'introduction du discriminant. Les users existants restent désync (ou risque de
  re-grant). C'est la faiblesse de fond de la matérialisation.
- ❌ Cron récurrent qui ré-écrit des lignes pour un état dérivable du rôle = la dette que l'Option A
  supprime.

### Option C — snapshot de version de template par user / watermark de date d'ajout des codes

Rejeté (YAGNI) : suivre quand chaque code a été ajouté pour ne backfiller que les users plus anciens =
sur-ingénierie pour ce que `autorise=false` + Option A traitent en une migration.

## 5. Décision bloquante (humain) — les retraits historiques ne sont pas enregistrés

Indépendamment de A ou B : aujourd'hui un défaut-de-rôle **absent** peut être un retrait délibéré
*ou* un code jamais reçu, et **c'est irrécupérable rétroactivement**. Le tout premier passage doit
trancher, pour chaque (user, code-défaut-absent) :

- **(P1 — recommandé, conservateur, sûr pour l'authz)** : traiter toute absence actuelle comme
  **retrait délibéré**. One-time migration : pour chaque user, chaque code de `ROLE_TEMPLATES[role]`
  **absent** → `INSERT autorise=false`. **Préserve à l'identique les permissions effectives
  actuelles**, puis (Option A) bascule le reader → désormais le registre est vivant et tout **nouvel**
  ajout se propage. Zéro changement d'autorisation au déploiement.
- **(P2)** : traiter l'absence comme « jamais reçu » → backfiller (Option B, dry-run + revue humaine
  du diff avant d'armer). Risque : re-accorder des permissions retirées dont la trace est perdue.

> Recommandation : **P1 + Option A**. Une migration de bascule (matérialise les retraits en
> `autorise=false`), puis le reader dérive du registre. Le problème de désync ne **peut plus**
> réapparaître ; aucun cron à maintenir. Le reconciler (Option B) reste disponible comme filet
> *vérificateur* (dry-run, alerte si dérive), pas comme mécanisme principal.

## 6. Déclencheur & idempotence

- **Option A** : aucun déclencheur runtime. La migration de bascule (§5-P1) tourne **une fois** au
  provision (`provision-database.ts`, owner `artisan_user`, sous advisory lock) comme toute migration.
  Idempotente par construction (`ON CONFLICT DO NOTHING`).
- **Option B** : `JobDefinition` **cron** (`periodKey` quotidien), `dryRun:true` d'abord puis armé —
  **pas** au boot (un mass-write cross-tenant sous le lock de provision est lourd et inutile).
  Idempotent via `detect()` (n'agit que sur les trous réels) + UNIQUE + `ON CONFLICT DO NOTHING`.

## 7. RLS — l'exception, documentée

Règle générale (mémoire `reconciler-cross-tenant-rls-owner-pool`) : un reconciler qui **découvre**
cross-tenant sur une table **RLS-FORCE** doit passer par le **pool owner** (`getOwnerDbHandle`), car
app_tenant sans `app.tenant` voit 0 ligne (no-op silencieux, false-green).

**Ici l'exception s'applique** : `permissions_utilisateur` est **RLS entièrement désactivée**
(20260629222008) et `users` est lue pré-tenant (`role-reader.ts`). Le scan de découverte
(`users.role`/`artisanId` + lignes de permission) fonctionne **sous app_tenant**, **sans pool owner**.
La migration de bascule §5 tourne, elle, sous **owner** (`artisan_user`) car c'est une migration de
provision. C'est l'exception qui confirme la règle : on n'utilise app_tenant pour la découverte que
parce que la table est explicitement RLS-off.

## 8. Test (anti false-green — obligatoire sous app_tenant)

Sous `APP_DATABASE_URL` (rôle `app_tenant`, **jamais** owner — sinon RLS contournée → false-green) :

1. **Reproduire la désync** : user `secretaire`, supprimer une ligne d'un de ses défauts de rôle (ex.
   `clients.voir`) → `getPermissions` ne le retourne pas (Option A : reader dérive ; rouge avant).
2. **Réparer** : appliquer la solution (A : migration de bascule + reader dérivé ; B : reconciler) →
   permission effective restaurée (vert après).
3. **Owner** : aucune ligne écrite pour l'owner (`isOwner`), permissions effectives = ALL via bypass.
4. **Retrait préservé** : user avec `autorise=false` sur un défaut → **jamais ré-accordé** (forward-fix
   only). Test explicite anti-régression authz.
5. **Override additif** : grant `autorise=true` hors rôle → conservé.

## 9. Recommandation

1. **Option A + §5-P1** : migration de bascule (retraits historiques → `autorise=false`) puis reader
   qui **dérive** `ROLE_TEMPLATES[role]` ∪ grants − retraits. Supprime la classe de bug, aucun cron.
2. Option B (reconciler `runReconciler`, dry-run) gardé en **filet vérificateur** optionnel, pas en
   mécanisme principal.
3. **Bloquant humain** : valider P1 (conservateur) vs P2, car le choix change des autorisations
   réelles et est irréversible sur les données héritées.

**Prochaine étape** : validation humaine de (Option A vs B) et (P1 vs P2) → puis tâche
d'implémentation dédiée (worktree + reviewer gate). Aucune ligne de code écrite dans ce SPIKE.

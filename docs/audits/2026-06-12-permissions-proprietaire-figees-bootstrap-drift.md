# Audit — Permissions du propriétaire FIGÉES au bootstrap (snapshot `ALL_PERMISSIONS`) → owner verrouillé hors de tout module gated ajouté APRÈS son inscription

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**
**Domaine** : gestion des rôles / permissions (comptes multi-utilisateurs). Distinct d'OPE-17 (collab trop large), OPE-7 (seeding initial), OPE-42 (protection owner).

---

## Le système de permissions est SAIN (vérifié) — sauf la réconciliation du propriétaire

### ✅ Ce qui est correct
- `requirePermission(...)` (`server/_core/trpc.ts:68`) charge `ctx.user.permissions` et exige les codes ; **admin** bypass ; sinon FORBIDDEN. Sound.
- La **comptabilité** est **correctement gated** : tous les endpoints (`getEcritures`/`getGrandLivre`/`getBalance`/`getRapportTVA`/`getDeclarationTVA`/`getFecPreview`/`getFecConformite`/`genererEcrituresFacture`/`getPlanComptable`…) utilisent `comptaVoirProcedure = requirePermission("comptabilite.voir")` (`routers.ts:5905+`). `technicien`/`secretaire` n'ont **pas** `comptabilite.voir` dans `ROLE_TEMPLATES` (`shared/permissions.ts:94`) → un collaborateur non comptable n'accède pas au FEC/TVA. ✓ (Contrairement à stock/dépenses/fournisseurs = OPE-17, non gated.)
- Permissions chargées par utilisateur depuis `permissions_utilisateur` (`auth-simple.ts`), `actif=false` → bloqué, défaut moindre privilège. ✓

## 🟠 HIGH — le propriétaire (role `artisan`) n'a PAS de bypass, et ses permissions sont un snapshot figé

`requirePermission` ne bypass **que** `role === "admin"` (`trpc.ts:74`). Le **propriétaire** d'un tenant a `users.role = "artisan"` (pas `admin`) → il est **soumis** au check de permission, donc il **doit** posséder dans `permissions_utilisateur` **chaque** code gated (`comptabilite.voir`, `devis.voir`, `factures.voir`, …).

Or ses permissions sont semées **une seule fois**, au bootstrap, **et seulement si la table est vide** :
```ts
// server/db.ts — bootstrapArtisanAccount, étape 4
const existingPerms = await getUserPermissions(userId);
if (existingPerms.length === 0) {
  await setUserPermissions(userId, [...ALL_PERMISSIONS], artisan.id); // SNAPSHOT figé
}
```
Aucune **réconciliation** ultérieure (ni au login, ni ailleurs : `grep setUserPermissions` → seulement bootstrap (owner, once) + invite (collaborateur)).

### Conséquence (le footgun)
`ALL_PERMISSIONS` **grandit** dans le temps (chaque nouveau module gated ajoute un code — ex. `comptabilite.voir` a été ajouté à un moment). Un propriétaire inscrit **avant** l'ajout d'un code garde son **ancien** snapshot → quand le module gated est livré, **l'owner reçoit FORBIDDEN** sur SON PROPRE module, **sans recours** (il n'y a pas d'écran pour s'auto-réattribuer une permission ; `updatePermissions` est `utilisateursGererProcedure`, mais s'appliquer à soi-même un code absent suppose une UI qui n'expose que les codes courants — et de toute façon, c'est l'owner qui devrait l'avoir d'office).

### Portée / sévérité
- **Nouveaux signups (cohorte 30 juin)** : bootstrap sème `ALL_PERMISSIONS` **courant** → owner OK. **Non bloquant pour la cohorte de lancement.**
- **Comptes existants (staging + early access)** : tout owner créé **avant** l'ajout d'un code gated est **déjà** verrouillé hors de ce module **maintenant**. À vérifier en base sur staging (les comptes anciens peuvent ne pas avoir `comptabilite.voir`).
- **Évolution post-lancement** : **chaque** future permission gated **verrouille tous les owners existants** hors du nouveau module jusqu'à reseed manuel → régression silencieuse à chaque livraison. → **HIGH** (classe de bug récurrente, pas un one-shot).

## Odoo 19

L'**administrateur de société** (propriétaire) cumule les groupes de droits de son périmètre ; il n'est jamais « privé » d'un module de sa propre société par un snapshot figé — l'appartenance aux groupes est **dérivée**, pas gelée à la création.

## Fix proposé (sans bypass dangereux sur le role `artisan`)

⚠️ **Ne PAS** bypasser `requirePermission` sur `role === "artisan"` : un **collaborateur** peut être invité avec le role `artisan` (`utilisateurs.invite` accepte `artisan`), donc un bypass role-based donnerait le plein accès à un collaborateur. Le bypass doit cibler le **propriétaire réel**.

Deux options (l'une ou l'autre) :
1. **Bypass owner** dans `requirePermission` : si `ctx.user.id === artisan.userId` (le user EST le propriétaire de son tenant), accorder l'accès (comme admin). Nécessite de charger/porter `artisan.userId` dans le contexte (1 lookup, cachable).
2. **Réconciliation idempotente** : au bootstrap **et** au login (ou via un job léger), pour le propriétaire (`users.id === artisan.userId`), faire une **UNION** des permissions manquantes vers `ALL_PERMISSIONS` (au lieu de `if (existingPerms.length === 0)`), de sorte que tout nouveau code gated soit automatiquement attribué à l'owner.

L'option **1** est la plus robuste (un owner ne peut jamais être privé de son tenant). À combiner avec le maintien du gating per-permission pour les **collaborateurs**.

## Linear

Nouvelle issue **« Lancement 30 juin »** (HIGH). Anti-doublon : distinct d'OPE-7 (seeding initial — fait), OPE-17 (collab trop large — problème inverse), OPE-42 (protection de l'owner contre un collab). Aucune issue ne couvre le **drift du snapshot de permissions du propriétaire**.

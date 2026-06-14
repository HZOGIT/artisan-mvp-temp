# Audit — Gestion des collaborateurs / utilisateurs (invite, rôles, permissions) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `utilisateursRouter` (`routers.ts:7557-7700`) — `invite`, `updateRole`,
> `toggleActif`, `getPermissions`, `updatePermissions`, `resetPermissions` — et les
> fonctions DB associées (`createCollaborator`, `updateUserRole`, `toggleUserActif`,
> `setUserPermissions` `db.ts:3282-3355`). `PLAN_LIMITS` (`db.ts:3966`).

---

## Conclusion : les findings réels sont déjà tracés. Pas de nouvelle issue.

### Déjà couvert (anti-doublon → SKIP)

| Constat (re-vérifié dans le code) | Issue |
| -- | -- |
| `invite` (`:7568`) / `createCollaborator` (`db.ts:3282`) ne comptent **jamais** les utilisateurs vs `maxUsers` du plan → sièges illimités gratuits (trial/essentiel = 1, pro = 3, entreprise = 10, + `extraUsers` achetables, `db.ts:3966-3971`). `grep` : `maxUsers` est **écrit** (webhook) et **lu pour affichage** (`:8159`) mais **jamais appliqué**. | **OPE-65** |
| `updateRole` (`:7626`) / `toggleActif` (`:7642`) ne vérifient que l'appartenance entreprise — **aucune protection du propriétaire** (`artisan.userId`) → un collaborateur « gérer utilisateurs » peut désactiver/rétrograder l'owner | **OPE-42** |
| `tempPassword = Math.random().toString(36).slice(-10)` (`:7582`) non crypto-sûr | **OPE-18** |
| Collaborateur (technicien) exécute des actions hors rôle via l'assistant IA | **OPE-54** |

### Vérifié sain (pas de faille)

- **Écriture des permissions correctement scopée tenant** : `updatePermissions`
  (`:7668`) appelle `setUserPermissions(userId, perms, artisan.id)`, et la fonction DB
  (`db.ts:3340-3346`) **vérifie** `user.artisanId === artisanId` et **throw** sinon →
  **pas d'IDOR** cross-tenant sur les permissions (j'ai d'abord suspecté l'absence de
  garde dans le routeur — le contrôle est dans la couche DB). `updatePermissions`
  filtre aussi les permissions contre `ALL_PERMISSIONS` (`:7676`).
- `updateUserRole` / `toggleUserActif` (`db.ts:3305/3315`) vérifient
  `user.artisanId === artisanId` avant écriture → pas de cross-tenant.
- `getPermissions` / `resetPermissions` (`:7655/7681`) vérifient l'appartenance du
  `targetUser` (`targetUser.artisanId !== artisan.id` → NOT_FOUND).
- `invite` refuse un email déjà utilisé (`:7580`, CONFLICT) et seed les permissions
  par défaut du rôle (`ROLE_TEMPLATES`).

---

## Réserves mineures (non bloquantes, pas d'issue)

1. **Mot de passe temporaire en clair dans l'email d'invitation** (`:7613`) — pattern
   d'invitation courant, mais préférable à terme : envoyer un **lien d'activation à
   usage unique** (set-password) plutôt qu'un mot de passe en clair (qui reste dans la
   boîte mail). Lié à OPE-18 (génération) ; à traiter ensemble.
2. **Self-escalation théorique via `updatePermissions`** : un collaborateur disposant
   de la permission « gérer utilisateurs » peut passer **son propre** `userId` et
   s'octroyer n'importe quelle permission de `ALL_PERMISSIONS` (finances, etc.). C'est
   discutable (administrer l'équipe est une permission de confiance par nature) et
   relève du **cluster connu de faiblesses du système de permissions** (OPE-17/42/54)
   plutôt que d'une faille isolée. À arbitrer côté produit : interdire de modifier ses
   propres permissions / d'octroyer une permission qu'on ne détient pas soi-même.
   Documenté ici, **sans issue séparée** (éviter un doublon-en-esprit du cluster).

---

## Verdict

Gestion des collaborateurs : écriture des permissions et des rôles **correctement
scopée tenant** (pas d'IDOR). Les deux vrais problèmes — **limite de sièges non
appliquée** (OPE-65) et **absence de protection de l'owner** (OPE-42) — sont **déjà
tracés**, de même que le `tempPassword` faible (OPE-18) et le bypass assistant
(OPE-54). → **SKIP anti-doublon, pas de nouvelle issue.** Réserves : mot de passe en
clair par email + self-escalation théorique (cluster permissions), documentées sans
issue.

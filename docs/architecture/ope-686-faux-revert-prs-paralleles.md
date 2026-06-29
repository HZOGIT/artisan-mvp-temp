# OPE-686 — Faux-revert des PRs parallèles : décision

**Type** : spike (décision). **Date** : 2026-06-29. **Statut** : reco retenue → impl. séparée.

## Problème

Chaque worker crée son worktree depuis `origin/staging` à l'instant T
(`launch-claude-bg.sh:104`). Pendant qu'il code, d'autres PRs mergent. À la review,
`git merge-base --is-ancestor origin/staging <branche>` échoue → branche **périmée**, et
le diff **deux-points** `git diff origin/staging <branche>` affiche un **faux-revert** des
fichiers déjà mergés par les autres (observé `#232 → #233 → #234`). Coût : 1 round
rejet + rebase/cherry-pick par PR.

## Deux problèmes distincts (à ne pas confondre)

1. **Conflit textuel / faux-revert** — la branche n'a pas les fichiers mergés par d'autres.
2. **Conflit sémantique** — deux PRs **chacune verte** et sans conflit textuel, mais qui
   **cassent staging une fois combinées** (A renomme un symbole, B l'utilise sur l'ancienne
   base). C'est le cas dangereux et silencieux.

## Constat décisif sur le (1) : le faux-revert est une *illusion* du diff deux-points

Le reviewer **squash-merge** (`reviewer-agent.md:191`). Un squash applique
`merge-base(staging, B)..B` (les changements **nets** de la PR, sémantique **trois-points**)
sur le **tip courant** de staging. Conséquence :

- Une branche périmée mais **`mergeable == MERGEABLE`** se squash-merge **correctement** :
  staging garde les changements de A, ajoute ceux de B. **Aucun revert.**
- Le faux-revert n'apparaît que dans le diff **deux-points** (`git diff origin/staging B`,
  utilisé par le G0 du reviewer). `gh pr diff` (GitHub) est déjà **trois-points** → ne le
  montre pas.
- Le **seul** cas textuel qui exige un vrai rebase est `mergeable == CONFLICTING`.

Le round systématique de rebase était donc **majoritairement inutile pour le (1)** :
déclenché par une heuristique deux-points qui flagge la péremption même quand le merge
est propre.

## Best practices industrie (recherche web, 2026-06-29)

- **GitHub merge queue** ([GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)) :
  « *ensures the branch is never broken by incompatible changes* » et « *provides the same
  benefits as 'Require branches to be up to date before merging', but does not require the PR
  author to update their branch and wait* ». **Réservé** aux repos d'**org** / GitHub
  Team/Enterprise (privé), admin requis, et **suppose un CI GitHub Actions** comme gate.
- **« Require branches to be up to date before merging »** (branch protection) : force chaque
  PR à être rebasée sur la base avant merge. C'est exactement **le round de rebase** —
  reporté sur l'auteur et **sérialisé** (la douleur « rebase after every commit merged into
  master », [SE.SE 447772](https://softwareengineering.stackexchange.com/questions/447772)).
- **Squash + up-to-date** = combo recommandé petites équipes (linéaire, parallélisme plein —
  [Mergify](https://docs.mergify.com/merge-queue/merge-strategies/)).
- **Le point clé** : `mergeable == true` ne garantit que l'**absence de conflit textuel**.
  La seule garantie de staging vert = **re-jouer le gate contre l'état post-merge** (récit
  vécu d'un conflit sémantique « surprisingly painful to unwind » →
  [thoughtbot/Bike Shed]). C'est *la raison d'être* de la merge queue.

**Traduction pour notre factory** : le reviewer **est déjà** une merge queue **sérielle de
un** (il merge une PR à la fois, après gate local tsc/lint/tests). Il manque une seule chose
pour matcher la best practice **sans** l'infra GitHub merge queue (qui ne colle pas : gate =
reviewer local, pas GH Actions) : **faire tourner le gate sur l'état intégré, pas sur la
branche périmée.**

## Reco retenue — (A) + (A') + (B)

### (A) Supprimer l'illusion (1) à la review — *gain principal, effort ~nul*
Le reviewer juge péremption/diff au **trois-points** + flag **`mergeable`**, pas au
deux-points. `mergeable == MERGEABLE` (base périmée incluse) → pas de rebut pour péremption ;
seul `CONFLICTING` renvoie au worker. Reformuler **G0** de `reviewer-agent.md` : péremption
seule ≠ REJET ; seuls **conflit** ou **stowaway** (fichier hors périmètre / `D` réel) le sont.

### (A') Gate sur l'état intégré — *couvre le (2) sémantique, la vraie best practice*
Avant le merge, le reviewer teste la **fusion** dans le worktree, pas la branche seule :
```bash
git -C "$WT" merge --no-commit --no-ff origin/staging   # simule le résultat post-merge
# tsc / vitest / lint ICI → vert = staging restera vert ; rouge = conflit sémantique réel
git -C "$WT" merge --abort
```
C'est l'équivalent « never broken by incompatible changes » de la merge queue, appliqué au
**point de sérialisation existant** (le reviewer), **sans bouncer** au worker sauf échec réel.

### (B) Auto-rebase préventif avant push — *réduit la fenêtre, cheap*
Dans `_worktree-footer.md`, juste avant `gh pr create` :
```bash
git fetch origin staging && git rebase origin/staging
git push --force-with-lease origin feat/<session>   # branche PROPRE au worker → sûr
```
`--force-with-lease` sur **sa propre** branche : pas d'historique partagé, ownership-safe.
Ne couvre pas la fenêtre post-push — c'est (A)+(A') qui la couvrent.

## Pistes écartées

- **(b) PM rebase les PRs ouvertes** : viole la propriété de branche (PM pousse sur les
  branches des workers, race avec un worker actif) et le rôle PM = dispatch-only
  (mémoire `pm-role-dispatch-only`, `feedback-pm-no-file-edits`). Rejeté.
- **(c) GitHub merge queue** : best practice « pure » mais **mismatch** — réservée org/
  Enterprise, suppose un gate GitHub Actions, alors que notre gate est un reviewer local
  à squash manuel. (A') en reproduit le bénéfice clé pour ~0 infra. Rejeté pour l'instant ;
  réévaluable si on migre le gate vers GH Actions.
- **(d) PRs petites / branchées au plus tard** : bonne hygiène, **ne garantit rien**.
  Conservé comme **note d'hygiène**, pas comme mécanisme.

## Critères

| Critère | (A)+(A')+(B) |
|---|---|
| Élimine le round manuel | Oui (sauf conflit textuel/sémantique réel — inévitable) |
| Couvre le conflit **sémantique** | Oui via (A') gate intégré — au-delà du périmètre initial du spike |
| Pas de réécriture d'historique partagé | Oui (`--force-with-lease` sur branche propre uniquement) |
| Compat multi-agents (propriété) | Oui (chaque worker ne touche que sa branche) |
| Détection garantie du faux-revert | Éliminé (squash + `mergeable`), pas juste détecté |
| Effort | Faible — édition de 2 prompts infra |

## Implémentation

Séparée du spike (issue dédiée, liée à OPE-686). Pas de code applicatif :
- `scripts/prompts/reviewer-agent.md` : G0 jugé via `mergeable`/trois-points (A) ; ajout du
  gate sur état intégré `merge --no-commit origin/staging` avant merge (A').
- `scripts/prompts/_worktree-footer.md` : rebase préventif `--force-with-lease` avant PR (B).

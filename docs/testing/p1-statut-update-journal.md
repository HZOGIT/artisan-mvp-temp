# P1 — Mise à jour du statut ignorée depuis le front (devis / factures / …)

Journal de travail du cron dédié (toutes les 2 min). **Relu à chaque réveil, écrit à chaque pas.**

## Symptôme (repro)
`POST https://staging.operioz.com/api/trpc/devis.update?batch=1`
body `{"0":{"json":{"id":20,"statut":"accepte"}}}`
→ réponse `statut:"envoye"` (INCHANGÉ). Le changement de statut est silencieusement ignoré.

## Cause racine (diagnostiquée)
La refonte new-stack a **séparé les transitions de statut hors de `update`** (design propre : la machine
à états garantit l'intégrité). Les schémas Zod `update` **excluent `statut`** :
- devis : `src/modules/devis/interface/trpc/devis.router.ts:54` (`updateSchema`, pas de `statut`).
- factures : `src/modules/factures/interface/trpc/factures.router.ts:51` (idem, pas de `statut`/`montantPaye`).

Les changements de statut passent par des **mutations dédiées** (machine à états) :
- **devis** → `marquerEnvoye` (→`envoye`), `accepter` (→`accepte`), `refuser` (→`refuse`), `expirer` (→`expire`) via `changerStatutDevis` (`devis.router.ts:159-174`).
- **factures** → `marquerEnvoyee`, `marquerEnRetard`, `marquerPayee(montant,date)` via `changerStatutFacture`/`marquerFacturePayee` (`factures.router.ts:170-215`).

MAIS le **client** appelle encore `trpc.<module>.update.mutate({id, statut})` :
- `client/src/pages/DevisDetail.tsx:243` → `updateMutation.mutate({ id, statut: newStatus })` (trpc.devis.update) → **CASSÉ**.
- `client/src/pages/FactureDetail.tsx:264` → `updateMutation.mutate({ id, statut: newStatus })` (trpc.factures.update) → **CASSÉ** (à confirmer).

Le backend strippe `statut` (absent du schéma Zod) → `modifier*` ne touche pas au statut → renvoie le document inchangé. **No-op silencieux.**

## Objectif
Aligner le **client** sur l'API new-stack pour TOUS les modules impactés, en préservant les invariants
(machine à états, intégrité financière, immutabilité post-signature/émission). Fix par défaut = **côté client**
(router vers la bonne mutation de transition) ; un backstop backend n'est à envisager que si plus sûr (justifier).

## Inventaire (à compléter au 1er passage)
`grep -rn "\.update\.useMutation\|\.update\.mutate" client/src` croisé avec les schémas backend `update`
qui excluent `statut`. Pour chaque module : `.update` accepte-t-il `statut` ? sinon quelle mutation de transition ?

| Module | Client envoie statut via .update ? | Backend .update accepte statut ? | Mutation de transition | État |
|---|---|---|---|---|
| devis | OUI (DevisDetail.tsx:243) | NON (router:54) | envoyer/accepter/refuser/expirer | ✅ CORRIGÉ (sha f69375e) |
| factures | OUI (FactureDetail.tsx:264) | NON (router:51) | envoyer/marquerEnRetard ; markAsPaid (payee) | ✅ CORRIGÉ (sha f69375e) |
| contrats | OUI (ContratDetail.tsx:173/183) | NON (router:26) | suspendre/reactiver/terminer/annuler | ✅ CORRIGÉ (sha f69375e) |
| interventions | OUI (Interventions.tsx/Calendrier.tsx) | **OUI** (router:57 statut dans updateSchema) | n/a | ✅ OK (pas de mismatch) |
| chantiers | OUI (Chantiers.tsx) | **OUI** (router:60 statut dans updateSchema) | n/a | ✅ OK (pas de mismatch) |
| commandesFournisseurs | via `updateStatut` dédié | n/a | updateStatut | ✅ OK (mutation dédiée) |
| avis | via `moderer` dédié (Avis.tsx:203/214) | n/a | moderer | ✅ OK (mutation dédiée) |
| vitrine demandesContact | via `updateDemandeContactStatut` dédié | n/a | dédié | ✅ OK (mutation dédiée) |
| clients/stocks/techniciens/fournisseurs | n'envoient pas de `statut` à `.update` (pas de workflow statut) | n/a | n/a | ✅ OK |

→ **Inventaire complet. Les 3 modules cassés (devis/factures/contrats) sont corrigés + déployés + vérifiés.**
Les autres soit acceptent `statut` dans `.update` (interventions/chantiers), soit ont déjà une mutation
dédiée (commandesFournisseurs/avis/vitrine), soit n'ont pas de workflow statut.

## Test anti-régression PERSISTANT
`scripts/staging-e2e-mutations.mjs` — cas « devis.statut-change » : change le statut d'un devis dans le
VRAI navigateur (UI réelle) et vérifie la persistance serveur. À étendre (factures/contrats) au besoin.
Règle CLAUDE.md ajoutée : tout fix livre un test e2e/anti-régression persistant.

## Méthode par itération (une itération = un module, bout-en-bout)
1. Relire ce journal. Prendre LE prochain module « à corriger » (priorité devis > factures > autres).
2. Corriger le **client** : mapper `newStatus` → la mutation de transition dédiée (gérer le cas paiement/montant).
   Conserver le rafraîchissement (invalidate/refetch) pour que l'UI reflète le nouveau statut.
3. Test anti-régression : idéalement un test backend confirmant `.update` n'altère pas `statut` ET que la
   mutation de transition l'applique (la plupart existent déjà — sinon en ajouter).
4. GATE : `pnpm exec tsc -p tsconfig.src.json` vert ET
   `DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp pnpm exec vitest run src` vert.
5. Commit chirurgical (chemins explicites, JAMAIS `-A`) + push staging + revérifier `origin/staging`.
   Déployer : `deploy-staging-pages.sh` (client) et/ou `deploy-staging-newstack.sh` (src/).
6. **Vérifier la repro au VRAI navigateur** (`./scripts/pw-run.sh`) : changer le statut d'un devis/facture
   sur https://staging.operioz.com, confirmer que le statut **persiste** après refetch. Puis rejouer
   `./scripts/pw-run.sh scripts/staging-e2e-sweep.mjs` (0 issue attendu).
7. Mettre à jour ce journal (état du module = ✅) + ntfy (`devtools/agents/ntfy-pub.sh`).

## Invariants à préserver
Machine à états (transitions valides, Conflict 409 si invalide), intégrité financière (numérotation,
totaux dérivés), immutabilité post-signature (devis) / post-émission (factures), isolation multi-tenant/RLS.
AUCUNE référence OPE-XXX dans le code. Discipline branche partagée `staging` (cf CLAUDE.md).

## Décisions ouvertes / à valider
(si un module nécessite une décision produit ou touche un invariant sensible de façon ambiguë → NE PAS coder,
consigner ici + ntfy.)

## Log d'itérations
- 2026-06-16 ~10:45 — Cron dédié créé (toutes les 2 min). Crons standing (e2e sweep + Fixes Lancement) mis en pause. Root cause diagnostiquée (ci-dessus). Inventaire à compléter au 1er firing.
- 2026-06-16 ~11:00 — **P1 résolu en une passe** (devis + factures + contrats), sha `f69375e`, déployé Pages.
  Vérif VRAI navigateur : devis #20 « envoye → Accepté » via l'UI → `newStatut:"accepte"` (persiste), 0 erreur API.
  Sweep e2e rejoué : `issues: 0`. Inventaire complet (cf. tableau). Test persistant ajouté
  (`scripts/staging-e2e-mutations.mjs`) + règle CLAUDE.md. → **Plus rien à corriger sur ce P1** : le cron
  dédié peut no-op (tout vert).

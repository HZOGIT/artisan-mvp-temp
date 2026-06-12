# Fix (MODE A) — `deleteChantier` : lignes `suivi_chantier` orphelines à la suppression d'un chantier

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (intégrité données, orphelins opérationnels)

> `deleteChantier` (`server/db.ts:2307`). Même classe que les cascades déjà corrigées
> (`deleteStock` → mouvements_stock, `deleteFournisseur` → articles/commandes).

---

## Constat

`deleteChantier` supprimait `documents_chantier`, `interventions_chantier`,
`phases_chantier`, puis le chantier — **mais pas `suivi_chantier`**. Or `suivi_chantier`
(`drizzle/schema.ts:1381`) porte `chantierId NOT NULL` (jalons d'avancement :
`titre`, `statut a_faire|en_cours|termine`, `pourcentage`, `ordre`, `visibleClient`).

→ Supprimer un chantier laissait ses lignes `suivi_chantier` **orphelines** (aucune
contrainte FK dans le schéma → pas de rejet DB, accumulation silencieuse). Les 4 tables
référençant `chantierId` sont `phases_chantier`, `interventions_chantier`,
`documents_chantier`, `suivi_chantier` ; seule cette dernière n'était pas cascadée.

L'audit `2026-06-11-benchmark-projets-chantiers-ok.md` listait `suivi_chantier` comme
enfant du chantier mais n'avait pas relevé l'orphelin à la suppression.

## Fix appliqué (`server/db.ts:2307`)

Ajout de `await db.delete(suiviChantier).where(eq(suiviChantier.chantierId, id));` avant
la suppression du chantier (dans le bloc « delete related data first »).

- **Behavior-preserving** : la suppression d'un chantier fonctionne exactement comme avant ;
  elle nettoie en plus les lignes de suivi qui restaient orphelines. Aucun impact sur un
  chantier conservé.
- **Blast radius** : une seule fonction DB. `suivi_chantier` est **purement opérationnel**
  (avancement de chantier), **aucun document légal/fiscal** → cascade sans enjeu de rétention.
- Le routeur `chantiers.delete` (`routers.ts:6800`) reste **ownership-gated**
  (`assertChantierOwner`) — inchangé.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Distinct d'**OPE-177** (orphelins de `deleteIntervention`/`deleteContrat`, qui touchent des
éléments à **dimension légale** — signature client, factures récurrentes — laissés en
proposition). Ici = orphelin **purement opérationnel** (suivi de chantier), même classe que
les cascades déjà corrigées en MODE A sans issue dédiée. **Pas d'issue Linear** ; documenté ici.

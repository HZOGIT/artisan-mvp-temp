# Fix (MODE A) — `deleteDevis` : orphelins `relances_devis` + `devis_options(/lignes)` à la suppression d'un devis

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (intégrité données, orphelins opérationnels)

> `deleteDevis` (`server/db.ts:511`). Suite du sweep cascades opérationnelles
> (`deleteStock`, `deleteFournisseur`, `deleteChantier` → suivi_chantier).

---

## Constat

`deleteDevis` ne supprimait que `devis_lignes` puis le devis. Tables référençant `devisId`
(`drizzle/schema.ts`) et leur sort à la suppression :

| Table | Nature | Cascadé avant ? |
| -- | -- | -- |
| `devis_lignes` | lignes | ✅ oui |
| `relances_devis` | rappels de relance | ❌ **orphelin** |
| `devis_options` (+ `devis_options_lignes`) | variantes/options proposées | ❌ **orphelin** |
| `signatures_devis` | valeur probante (signature) | ⏸️ laissé (hors périmètre — OPE-50) |
| `factures` / `interventions` / `conversations` | entités **indépendantes** liées | laissé (lien, pas enfant) |
| `devis_genere_ia` | log de génération IA (lien nullable) | laissé (lien nullable, inoffensif) |

→ Supprimer un devis laissait ses `relances_devis` et ses `devis_options`/`devis_options_lignes`
**orphelines** (aucune contrainte FK en base → accumulation silencieuse).

## Fix appliqué (`server/db.ts:511`)

Avant la suppression du devis, cascade des enfants **purement opérationnels** :
```ts
const opts = await db.select({ id: devisOptions.id }).from(devisOptions).where(eq(devisOptions.devisId, id));
if (opts.length) await db.delete(devisOptionsLignes).where(inArray(devisOptionsLignes.optionId, opts.map(o => o.id)));
await db.delete(devisOptions).where(eq(devisOptions.devisId, id));
await db.delete(relancesDevis).where(eq(relancesDevis.devisId, id));
```
(Même style que `deleteDevisOption` existant : lignes par `optionId` → option.)

- **Behavior-preserving** : la suppression d'un devis fonctionne comme avant ; elle nettoie en
  plus relances + options qui restaient orphelines. Aucun devis conservé n'est affecté.
- **Blast radius** : une seule fonction DB. `relances_devis`/`devis_options` sont **purement
  opérationnels** (rappels, variantes) — **aucun document légal/fiscal**.
- **Hors périmètre (volontaire)** : `signatures_devis` (valeur probante) n'est **pas** touché —
  la suppressibilité d'un devis **signé** est une décision produit/légale suivie séparément
  (**OPE-50**). Le routeur `devis.delete` reste ownership-gated.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Orphelins **purement opérationnels** → même classe que les cascades déjà corrigées en MODE A
sans issue dédiée (`deleteStock`/`deleteFournisseur`/`deleteChantier`). Distinct d'**OPE-177**
(orphelins à dimension légale de `deleteIntervention`/`deleteContrat`) et d'**OPE-50** (signature
de devis). **Pas d'issue Linear** ; documenté ici.

# Audit — Chantiers (multi-interventions) : cloisonnement exemplaire (référence)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `chantiersRouter` (`routers.ts:6462-6720`) — chantiers, phases, interventions
> associées, documents, statistiques + helper `assertChantierOwner`.

---

## Conclusion : aucun IDOR, aucun BLOCKER/HIGH. Module = **implémentation de référence** du cloisonnement multi-tenant.

### ✅ Toutes les routes sont gardées

Le helper `assertChantierOwner(chantierId, userId)` (`chantier.artisanId === artisan.id`,
sinon `NOT_FOUND`) est branché sur **chaque** route prenant un id. Balayage des handlers
`async ({ input })` (sans `ctx`) dans le routeur → **0**. `list`/`create` scopés par
`artisanId` (forcé à la création).

| Route | Garde |
| -- | -- |
| `getById`/`update`/`delete` | `assertChantierOwner(input.id)` |
| `getPhases`/`createPhase`/`getInterventions`/`getDocuments`/`addDocument`/`getStatistiques`/`calculerAvancement`/`dissocierIntervention` | `assertChantierOwner(input.chantierId)` |

### ✅ Pattern parent→enfant correct (ce que OPE-9/10/89/90 violaient ailleurs)

Les routes agissant sur un **enfant** (phase/document) **résolvent d'abord le parent** puis
vérifient l'ownership — exactement le pattern manquant dans les IDOR corrigés cette session :
```ts
// updatePhase / deletePhase
const phase = await db.getPhaseChantierById(input.id);
await assertChantierOwner(phase.chantierId, ctx.user.id);
// deleteDocument
const doc = await db.getDocumentChantierById(input.id);
await assertChantierOwner(doc.chantierId, ctx.user.id);
```

### ✅ Double-vérification sur les associations (les DEUX ressources)

`associerIntervention` (`:6612-6616`) vérifie que **le chantier ET l'intervention**
appartiennent au même artisan — empêche d'associer l'intervention d'un autre tenant à son
propre chantier :
```ts
const { artisan } = await assertChantierOwner(input.chantierId, ctx.user.id);
const intervention = await db.getInterventionById(input.interventionId);
if (!intervention || intervention.artisanId !== artisan.id) throw NOT_FOUND;
```
C'est précisément la double-garde absente dans OPE-89 (`contrats.updateIntervention`) /
OPE-90 (article-fournisseur).

---

## Verdict

`chantiersRouter` est **entièrement cloisonné** : garde d'ownership systématique
(`assertChantierOwner`), résolution **enfant→parent** correcte pour phases/documents, et
**double-vérification** des deux ressources sur les associations. **Aucun IDOR, aucun nouveau
BLOCKER.** À utiliser comme **modèle de référence** pour finaliser les IDOR restants
(OPE-9/10 lignes & options de devis, routes push par-id d'OPE-31). **Pas de nouvelle issue
Linear.**

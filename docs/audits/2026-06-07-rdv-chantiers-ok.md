# Audit — RDV en ligne & chantiers — RAS bloquant

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `rdvRouter` (`routers.ts:7312`) et `chantiersRouter` (`:6270`).
> **Aucun BLOCKER/HIGH** → pas d'issue. Une note MEDIUM (double-booking).

---

## Chantiers — modèle d'isolation multi-tenant exemplaire ✓

`chantiersRouter` est **le meilleur exemple d'ownership de la codebase** :
**toutes** les routes appellent `assertChantierOwner(...)` avant d'agir, y
compris les entités **enfants** (phases / documents / suivi) où le `chantierId`
parent est résolu depuis l'enfant :

| Route | Ownership |
| -- | -- |
| getById/update/delete | `assertChantierOwner(input.id, ctx.user.id)` ✓ |
| getPhases/createPhase | `assertChantierOwner(input.chantierId, …)` ✓ |
| updatePhase/deletePhase | charge la phase → `assertChantierOwner(phase.chantierId, …)` ✓ |
| getDocuments/addDocument | `assertChantierOwner(input.chantierId, …)` ✓ |
| deleteDocument | charge le doc → `assertChantierOwner(doc.chantierId, …)` ✓ |
| getSuivi/createSuivi | `assertChantierOwner(input.chantierId, …)` ✓ |
| updateSuivi/deleteSuivi | charge le suivi → `assertChantierOwner(suivi.chantierId, …)` ✓ |
| associer/dissocierIntervention | `assertChantierOwner` + `intervention.artisanId` ✓ |

→ **Aucun IDOR**, même imbriqué (impossible de modifier une phase/un document/un
suivi d'un chantier d'un autre artisan).

### Référence pour la remédiation OPE-47

C'est **exactement** le pattern qu'OPE-47 recommande de généraliser. La codebase
contient déjà 3 implémentations correctes de ce pattern :
- `assertChantierOwner` (chantiers) — y compris enfants,
- `assertTechnicienOwner` (géolocalisation),
- couche `dbSecure.*Secure` (clients/devis/factures).

Les routeurs vulnérables d'OPE-47 (véhicules, congés, rapports…) n'ont
simplement **pas adopté** ce pattern pourtant présent. → Le correctif consiste à
**propager une garde existante**, pas à inventer.

---

## RDV en ligne — sain (ownership + transitions de statut)

- `confirm` (`:7330`) : `rdv.artisanId !== artisan.id` ⇒ refus ; garde de statut
  (« Ce RDV ne peut plus être confirmé ») ; crée l'intervention + bascule en
  `confirme` + email client. ✓
- `refuse` / `proposeAutreCreneau` : ownership + transitions de statut. ✓
- `list` / `getStats` : scopés `getRdvByArtisanId(artisan.id)`. ✓
- Le sélecteur de créneaux public (`getCreneauxDisponibles`) exclut déjà les
  créneaux occupés. ✓

### 🟡 MEDIUM (documenté, pas d'issue) — pas de garde anti double-booking côté serveur

`confirm` crée l'intervention au créneau demandé **sans vérifier qu'aucune autre
intervention ne chevauche** ce créneau. En pratique l'artisan confirme
manuellement (il voit son agenda) et le picker client exclut les créneaux pris,
mais deux demandes proches confirmées toutes deux créeraient un chevauchement.
**Fix** : vérifier l'absence de conflit (`getCreneauxOccupes` / overlap) avant de
créer l'intervention dans `confirm`. Non bloquant.

---

## Conclusion

RDV et chantiers sont **sûrs** (ownership rigoureux). Chantiers est même le
**modèle de référence** pour corriger les IDOR d'OPE-47. Aucun BLOCKER/HIGH ;
seul un garde-fou double-booking serveur est suggéré (MEDIUM).

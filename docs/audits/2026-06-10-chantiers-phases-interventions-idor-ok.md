# Audit — Chantiers : phases, budget, association d'interventions (IDOR/FK-injection) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `chantiersRouter` (`routers.ts:6280-6440+`) — CRUD chantier, phases
> (`getPhases`/`createPhase`/`updatePhase`/`deletePhase`), interventions
> (`getInterventions`/`associerIntervention`/`dissocierIntervention`) ; helper
> `assertChantierOwner` (`routers.ts:6266`).

---

## Conclusion : module entièrement cloisonné tenant. Pas de BLOCKER/HIGH.

### Helper d'appartenance correct

`assertChantierOwner(chantierId, userId)` : `artisan = getArtisanByUserId(userId)`,
`chantier = getChantierById(chantierId)`, rejet si `chantier.artisanId !== artisan.id` →
`NOT_FOUND`. Bloque le cross-tenant à la racine.

### Appliqué partout, y compris sur les **sous-ressources** (pas de FK-injection)

| Procédure | Garde | Réf |
| -- | -- | -- |
| `getById`/`update`/`delete` | `assertChantierOwner(input.id)` | `:6289,6330,6341` |
| `getPhases`/`createPhase` | `assertChantierOwner(input.chantierId)` **avant** lecture/ajout | `:6349,6364` |
| `updatePhase`/`deletePhase` | charge la phase → `assertChantierOwner(phase.chantierId)` | `:6386,6400` |
| `getInterventions` | `assertChantierOwner(input.chantierId)` | `:6408` |
| `associerIntervention` | `assertChantierOwner(input.chantierId)` **ET** `intervention.artisanId !== artisan.id` | `:6429-6431` |

→ **Impossible** d'ajouter une phase au chantier d'un autre tenant (FK `chantierId`
validée **avant** écriture), de modifier/supprimer une phase étrangère (ownership récupéré
via le parent), ou d'associer une intervention cross-tenant (les **deux** FK vérifiées).

> C'est le pattern **correct** « ownership via parent + validation des FK d'entrée » —
> exactement ce qui manquait aux routers IDOR déjà filés (vehicules, devisOptions, …).

---

## Verdict

Chantiers/phases/budget/associations : **`assertChantierOwner` systématique**, validation
du **parent** pour les sous-ressources, **double-check des FK** sur les associations. Pas
d'IDOR ni de FK-injection. **Pas de nouvelle issue Linear.**

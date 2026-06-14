# Audit — Calendrier / planning (events, couleurs, créneaux) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `calendrierRouter` (`routers.ts:7286`) — `getEvents`, `list`, `confirm` ;
> couleurs calendrier (`getCouleursCalendrier`/`setCouleurIntervention`/
> `setCouleursMultiples`, `routers.ts:2013-2060` + `db.ts:3975-4050`) ;
> `getCreneauxDisponibles` (`:4137`).

---

## Conclusion : module scopé tenant. Pas de BLOCKER/HIGH.

### Multi-tenant correct (aucun IDOR)

- **`getEvents`** (`:7287`) : itère `dbSecure.getInterventionsByArtisanIdSecure(artisan.id)`
  → uniquement les interventions du tenant ; client/technicien résolus depuis ces
  interventions (pas d'ID arbitraire d'entrée).
- **`list`** (RDV) → `getRdvByArtisanId(artisan.id)` ; **`confirm`** → `getRdvById` +
  `rdv.artisanId !== artisan.id` → FORBIDDEN. (Déjà couvert par
  `rdv-en-ligne-portail-client-ok`.)
- **Couleurs calendrier** : table `couleurs_interventions` à **clé composite
  (artisanId, interventionId)**. `getCouleursCalendrier`/set scopent `artisanId` dans le
  SQL → isolation tenant naturelle. `setCouleurIntervention(artisan.id, interventionId,
  …)` sur un `interventionId` étranger ne crée qu'une entrée **inutile dans son propre
  namespace** (ne lit/n'altère pas la donnée d'un autre tenant) → pas d'IDOR.
- **`getCreneauxDisponibles`** (public) : token-gated (`getClientPortalAccessByToken`),
  scopé `access.artisanId` — déjà audité (-ok).

---

## Réserves mineures (non bloquantes, pas d'issue)

1. **`getEvents` en N+1** : `getClientById` + `getTechnicienById` par intervention →
   performance sur gros volumes (pas sécurité). Reco : jointure/préchargement.
2. **`setCouleurIntervention`** ne vérifie pas l'appartenance de `interventionId` — sans
   impact (clé composite isole le tenant), mais à durcir par cohérence si on veut éviter
   les entrées orphelines.

---

## Verdict

Calendrier/planning : **scopé tenant** (events via interventions sécurisées, RDV
ownership-checked, couleurs à clé composite). Pas d'IDOR, pas de fuite cross-tenant.
Réserves = N+1 + cohérence couleurs. **Pas d'issue Linear.**

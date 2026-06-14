# Audit — Badges / gamification (IDOR faible impact)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `badgesRouter` (`routers.ts:6148`). **Pas de nouvelle issue** :
> relève d'OPE-47 (inventaire étendu par commentaire). Impact faible (données de
> gamification, pas financier/PII/légal).

---

## Ce qui fonctionne correctement

- `list` / `create` / `verifierBadges` / `getClassement` / `calculerClassement` /
  `createObjectif` : scopés sur `artisan.id` (et `verifierEtAttribuerBadges`
  reçoit `artisan.id`). ✓

---

## Relève d'OPE-47 — 5 routes non scopées (`async ({ input })`)

| Route | Ligne | Effet cross-tenant |
| -- | -- | -- |
| `update` | 6171 | modifie n'importe quel badge (par id) |
| `delete` | 6187 | supprime n'importe quel badge |
| `getBadgesTechnicien` | 6193 | lit les badges de n'importe quel technicien |
| `attribuerBadge` | 6199 | attribue un badge à n'importe quel technicien (+ badgeId arbitraire) |
| `getObjectifsTechnicien` | 6233 | lit les objectifs de n'importe quel technicien |

Anti-pattern habituel : handler `async ({ input })` **sans `ctx`** appelant
`db.*(input.technicienId / input.id)` (scopé par id seul).

### Impact

**Faible** : lecture/écriture cross-tenant de **données de gamification**
(badges, objectifs, classements internes des techniciens). Pas de données
financières, PII ou légales. Pollution/fuite de scores et badges entre tenants.

### Fix

Inclure dans la passe de remédiation OPE-47 : `assertTechnicienOwner(technicienId,
…)` sur `getBadgesTechnicien`/`attribuerBadge`/`getObjectifsTechnicien`, et un
check d'appartenance du badge (via `getBadgeById(id).artisanId`) sur
`update`/`delete`.

### Estimation

~30 min (dans le lot OPE-47).

---

## Conclusion

`badgesRouter` ajoute **5 routes** à l'inventaire IDOR d'OPE-47, **faible impact**
(gamification). Pas de nouvelle issue. Le reste du routeur est scopé.

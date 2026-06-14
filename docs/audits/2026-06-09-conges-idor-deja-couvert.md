# Audit — Congés / absences (`congesRouter`) : cluster IDOR déjà couvert (OPE-45 + OPE-31)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `congesRouter` (`routers.ts:5802-5908`) + helpers DB
> (`getCongesByTechnicien`, `getCongeById`, `updateCongeStatut`, `deleteConge`,
> `getSoldesConges`, `updateSoldeConges`, `db.ts:4485-4592`). Schéma `conges`/
> `soldes_conges` (`schema.ts:1019-1055`).

---

## Constat : IDOR multi-tenant confirmé, mais **déjà tracé**

Plusieurs endpoints prennent un `id`/`technicienId` **sans vérifier l'appartenance**
au tenant (helpers DB scopés par `id` seul, pas d'`artisanId`) :

| Endpoint | Ligne | Effet cross-tenant | Issue |
| -- | -- | -- | -- |
| `byTechnicien` | 5815 (no `ctx`) | lit l'historique de congés d'un technicien d'autrui (dont `maladie` = **donnée de santé RGPD**) | **OPE-31** |
| `approuver` | 5848 | approuve un congé d'autrui + mute son solde (`updateSoldeConges`) | **OPE-45** |
| `refuser` | 5869 | change le statut d'un congé d'autrui | **OPE-45** |
| `annuler` | 5875 | idem | **OPE-45** |
| `delete` | 5881 (no `ctx`) | **hard-delete** d'un congé d'autrui | **OPE-45** |
| `getSoldes` | 5888 (no `ctx`) | lit les soldes d'un technicien d'autrui | **OPE-45/31** |

→ **SKIP** : le cluster est intégralement couvert par **OPE-45** (🔴 BLOCKER — write/
hard-delete + soldes par `congeId`) et **OPE-31** (🔴 BLOCKER — routes `technicienId`
sans ownership). Pas de nouvelle issue.

### Endpoints sains (scopés)

`list`/`enAttente`/`byPeriode` scopent `artisan.id` ; `create`/`initSolde` posent
`artisanId: artisan.id`.

---

## Complément apporté à **OPE-31** (commentaire)

`create` (`:5828`) et `initSolde` (`:5894`) acceptent aussi un `technicienId` **non
vérifié** (même pattern que `byTechnicien`). Impact direct faible (pollution de sa
propre liste / solde sur un technicienId étranger), mais le **fix d'OPE-31** (vérifier
`getTechnicienById` + `tech.artisanId === artisan.id`) doit couvrir **toutes** les
routes `technicienId` du module : `byTechnicien`, `create`, `initSolde`, `getSoldes`.
→ **OPE-31 étendu par commentaire**, pas de doublon.

---

## Verdict

Module congés : **IDOR multi-tenant réel** (lecture de données RH/santé + write/
hard-delete cross-tenant) — **déjà couvert** par OPE-45 + OPE-31. Précision de
complétude (`create`/`initSolde` technicienId) ajoutée à OPE-31. **Pas de nouvelle
issue Linear.**

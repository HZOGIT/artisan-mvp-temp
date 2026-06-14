# Audit — Nouveaux routeurs CRM (activités) & équipe d'intervention ✅ OK (aucun BLOCKER/HIGH ; 1 réserve LOW inerte)

**Date** : 2026-06-13 · **Projet** : Lancement 30 juin · **Domaine** : surface API récemment ajoutée (CRM next-action + équipe d'intervention)

> Audit de sécurité/scoping des **deux routeurs ajoutés ce jour** (non encore audités) :
> `activitesRouter` (`server/routers.ts:10435`, OPE-121) et les endpoints **équipe d'intervention**
> (`server/routers.ts` `interventions.getEquipe`/`ajouterMembreEquipe`/`retirerMembreEquipe`, OPE-111).
> Recherche : IDOR multi-tenant (écriture/lecture par id sans ownership), injection FK, bornes d'entrée, rate-limit.

---

## ✅ `activitesRouter` (CRM — rappels/next-action)

| Endpoint | Scoping / garde | Verdict |
|---|---|---|
| `list` | `getActivitesByArtisanId(artisan.id)` → `WHERE artisanId` | ✓ |
| `create` | insert avec `artisanId = artisan.id` ; `titre` `.min(1).max(500)`, `note .max(5000)`, `echeance` **validée** (`isNaN` → 400), `entiteId` `int().positive()` | ✓ |
| `toggleFait` | `setActiviteFait(id, artisan.id, fait)` → `UPDATE … WHERE id = ? AND artisanId = ?` | ✓ **pas d'IDOR** |
| `delete` | `deleteActivite(id, artisan.id)` → `DELETE … WHERE id = ? AND artisanId = ?` | ✓ **pas d'IDOR** |

→ Les deux mutations « par id » (`toggleFait`/`delete`) **rejointent l'`artisanId`** dans le `WHERE` (vérifié dans `server/db.ts`) : un id d'une autre entreprise ne matche aucune ligne (no-op silencieux, ni lecture ni écriture cross-tenant). Inputs bornés. **Pas de rate-limit nécessaire** (mutations authentifiées, sans envoi externe/amplification).

## ✅ Équipe d'intervention (planning — OPE-111)

| Endpoint | Scoping / garde | Verdict |
|---|---|---|
| `getEquipe` | vérifie `intervention.artisanId === artisan.id` (`FORBIDDEN` sinon) puis `getEquipeIntervention(interventionId, artisan.id)` → `WHERE interventionId AND artisanId` | ✓ |
| `ajouterMembreEquipe` | **double** ownership : `intervention.artisanId === artisan.id` **ET** `tech.artisanId === artisan.id` (`getTechnicienById`) avant insert ; `role .max(50)` ; insert idempotent (dédup `interventionId+technicienId`) | ✓ **anti-injection FK** |
| `retirerMembreEquipe` | `removeMembreEquipe(id, artisan.id)` → `DELETE … WHERE id = ? AND artisanId = ?` | ✓ **pas d'IDOR** |

→ Aucune affectation cross-tenant possible (l'intervention **et** le technicien sont validés contre l'artisan courant). La table de liaison est nettoyée à `deleteIntervention` (pas d'orphelin). Migration `0025` additive (non destructive).

---

## 🟢 Réserve LOW — `activites.create` ne valide pas l'appartenance de `entiteId`

`create` accepte `entiteType`/`entiteId` (rattachement client/devis/facture/chantier) **sans vérifier** que l'`entiteId` appartient à l'artisan. **Impact nul / inerte** :
- L'activité est stockée avec **l'`artisanId` de l'auteur** ; `list` ne renvoie que ses propres activités.
- L'affichage client/facture (onglet « Rappels ») filtre par `entiteType`+`entiteId` **sur une page déjà tenant-scopée** (`getById` refuse une entité d'un autre tenant) → une activité pointant vers un `entiteId` étranger ne s'afficherait **jamais** (la page de l'entité étrangère est inaccessible), et l'autre tenant ne la voit pas (sa liste est scopée).
- Donc : ni fuite, ni écriture cross-tenant, ni affichage trompeur. Au pire une **référence pendante** dans ses propres données.

**Recommandation** (cosmétique, non bloquante) : valider `entiteId` via le helper `*ByIdSecure` correspondant au `entiteType` à la création, par cohérence avec le pattern FK systémique. **Pas d'issue Linear** (aucun impact sécurité/launch).

---

## Verdict

Les deux nouveaux routeurs sont **correctement cloisonnés multi-tenant** : toutes les mutations « par id » rejointent l'`artisanId` dans le `WHERE` (pas d'IDOR), les affectations d'équipe valident l'appartenance de l'intervention **et** du technicien (pas d'injection FK), les entrées texte sont bornées, les dates validées. **Aucun BLOCKER/HIGH** → **pas d'issue Linear**. Unique réserve **LOW** : `activites.create` ne valide pas l'appartenance de `entiteId` — **inerte** (aucune surface d'exposition), à durcir par cohérence post-lancement.

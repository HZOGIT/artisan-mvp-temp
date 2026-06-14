# Benchmark/QA — Habilitations / certifications techniciens : scoping + correctness ✅ OK (parité MVP, 1 nice-to-have LOW)

**Date** : 2026-06-13 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe scoping multi-tenant + cycle de vie) · **Domaine** : RH / habilitations BTP (`habilitations_techniciens`, OPE-162 ↔ Odoo `hr` / `hr_skills`)

> Vérification **correctness + scoping multi-tenant** du module récemment ajouté (OPE-162) : suivi des habilitations BTP avec échéance (habilitation électrique NF C18-510, CACES, travail en hauteur…). Risques : IDOR cross-tenant (lire/écrire/supprimer les certifs d'un autre artisan), suppression cross-technicien, dates invalides, échéance non exploitée.

---

## ✅ Scoping multi-tenant strict (chaîne `assertTechnicienOwner`)

`assertTechnicienOwner(technicienId, userId)` (`routers.ts:6264`) : résout l'artisan depuis l'user, charge le technicien, et **refuse (NOT_FOUND)** si `tech.artisanId !== artisan.id`. Appliqué en **tête de chaque** endpoint :

| Endpoint | Garde | DB | Verdict |
|---|---|---|---|
| `getHabilitations` (`:5912`) | `assertTechnicienOwner` | `getHabilitationsByTechnicienId(technicienId)` (`db.ts:2473`, `WHERE technicienId=?`) | ✓ pas de fuite cross-tenant |
| `addHabilitation` (`:5919`) | `assertTechnicienOwner` → `artisanId` **posé serveur** (`= artisan.id`, `:5939`) | `createHabilitationTechnicien` | ✓ pas de mass-assignment d'`artisanId` |
| `deleteHabilitation` (`:5948`) | `assertTechnicienOwner` | `deleteHabilitationTechnicien(id, technicienId)` (`db.ts:2490`, `WHERE id=? AND technicienId=?`) | ✓ pas de suppression cross-technicien **ni** cross-tenant |

→ Le `getArtisanByUserId` résout un **collaborateur** vers l'artisan parent → un secrétaire/technicien du tenant agit dans son tenant, jamais au-delà. **Aucun IDOR.** La suppression est doublement scopée (`id` + `technicienId` vérifié appartenir à l'artisan) → on ne peut pas supprimer l'habilitation d'un technicien d'un autre artisan en devinant un `id`.

## ✅ Robustesse des entrées

- **Bornes texte** (`:5922-5924`) : `type` 1–255, `numero` ≤100, `organisme` ≤255 (alignées colonnes), `.trim()`. ✓
- **Dates** : `parseDate` (`:5932`) ignore les valeurs invalides (→ `null`) au lieu d'insérer une date NaN — cohérent avec le sweep « dates invalides ». `dateObtention`/`dateExpiration` sont **nullable** (une habilitation sans échéance reste valide). ✓
- **Cascade** : `deleteTechnicien` (`db.ts:2457`) nettoie `habilitations_techniciens` (enfant **purement opérationnel**, pas un document légal) → pas de lignes orphelines. ✓

## ✅ Cycle de vie / échéance exploitée

Le front `Techniciens.tsx:508-517` calcule un **badge d'état par habilitation** depuis `dateExpiration` :
- `joursRestants < 0` → **« Expirée »** (rouge / destructive),
- `≤ 60 j` → **« Expire dans X j »** (secondary),
- sinon **« Valide »** ; pas de date → **« Sans échéance »**.

→ L'échéance n'est **pas** une donnée morte : l'artisan voit immédiatement le statut sur la fiche technicien (enjeu sécurité/légal BTP : un habilitation électrique expiré interdit l'intervention).

## Odoo 19

Le cœur RH d'Odoo (`hr.employee`, `hr_skills`) gère des **compétences/niveaux** mais **pas nativement** le suivi réglementaire d'**habilitations à échéance** (il faut un module tiers/custom pour l'expiry des CACES/habilitation élec). Operioz est donc **au niveau, voire en avance**, sur ce besoin FR BTP précis : modèle dédié + échéance + badges d'état.

## 🟡 Nice-to-have LOW (pas de ticket — sous le seuil, OPE-162 trace déjà la feature)

**Alerte proactive globale d'expiration** : aujourd'hui le badge « Expire dans X j / Expirée » n'apparaît qu'en **ouvrant** la fiche d'un technicien. Un **widget dashboard** « N habilitations expirent sous 60 j » (lecture seule, agrégat sur `habilitations_techniciens` scopé artisan) — voire un blocage/avertissement à l'**affectation au planning** d'un technicien non habilité — surfacerait le risque sans contrôle manuel. **Valeur réelle mais LOW pour un artisan à faible effectif** (peu de techniciens → le badge par fiche suffit). À considérer comme **enrichissement d'OPE-162**, pas un nouveau ticket (évite le bruit backlog).

---

## Verdict

Le module **habilitations/certifications techniciens** (OPE-162) est **sain et complet pour un MVP** : **scoping multi-tenant strict** (chaîne `assertTechnicienOwner` + suppression doublement scopée → aucun IDOR cross-tenant/cross-technicien), `artisanId` posé serveur (pas de mass-assignment), **bornes** texte + **gardes de date**, cascade propre, et **échéance exploitée** (badges Valide/Expire/Expirée). Operioz couvre un besoin FR BTP qu'Odoo ne gère pas nativement. **Aucun BLOCKER/HIGH → pas d'issue Linear.** Seul nice-to-have **LOW** : une alerte d'expiration **globale** (dashboard / garde planning) — enrichissement futur d'OPE-162, non bloquant.

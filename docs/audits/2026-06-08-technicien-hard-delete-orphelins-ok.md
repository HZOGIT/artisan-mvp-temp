# Audit — Suppression technicien : hard-delete sans cascade → données orphelines (MEDIUM)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `techniciens.delete` (`routers.ts:4878`) → `deleteTechnicien`
> (`db.ts`). Intégrité des données à la suppression d'un technicien.

---

## Ce qui fonctionne

- **Ownership vérifié** : `technicien.artisanId !== artisan.id ⇒ NOT_FOUND`
  (`routers.ts:4886-4888`). Pas d'IDOR.

## 🟡 MEDIUM — Hard-delete sans cascade ni soft-delete → références orphelines

```typescript
// db.ts deleteTechnicien — DELETE sec, aucun nettoyage/réassignation
export async function deleteTechnicien(id) {
  await db.delete(techniciens).where(eq(techniciens.id, id));
}
```

Or le schéma `techniciens.statut` est un `enum("actif","inactif","conge")`
(`schema.ts:725`) → un **soft-delete (`inactif`) était prévu**, mais le endpoint
**hard-delete**. Aucune garde contre la suppression d'un technicien ayant des
enregistrements liés. Conséquences (colonnes `technicienId` sans contrainte FK) :

- **`interventions.technicienId`** → orphelin : l'intervention historique perd son
  intervenant (donnée opérationnelle corrompue silencieusement).
- **`disponibilites_techniciens`**, **`conges`**, **badges/objectifs**,
  **classements** → lignes orphelines.
- **`positions_techniciens`** + **`interventions_mobile.latitude/longitude`** →
  **géoloc d'un salarié supprimé conservée indéfiniment** (cf. RGPD ci-dessous).

### Pas de crash serveur confirmé (mais surface client)

Les lectures serveur itèrent les techniciens **vivants** de l'artisan
(`getAllTechniciensPositions`, suggestions, calendrier `getEvents` null-check à
`routers.ts:7301`) → pas de null-deref serveur. Mais `getCongesEnAttente` /
listes renvoient des **lignes brutes** avec `technicienId` orphelin : un composant
client qui ferait `techMap[id].nom` sans garde **crasherait** la page (classe
`/parametres`). Non confirmé côté client — à vérifier si Conges/Interventions
résolvent le nom sans null-check.

### Fix proposé

**Soft-delete** : passer `statut = 'inactif'` (déjà supporté par le schéma) au lieu
du `DELETE`, et filtrer les techniciens `inactif` des listes/sélecteurs
d'affectation → préserve l'historique. **Ou** garder le hard-delete mais **bloquer**
si des interventions/congés liés existent (`FORBIDDEN` + message), et **purger**
explicitement la géoloc.

---

## Volet RGPD (→ OPE-62)

La géoloc d'un technicien supprimé (`positions_techniciens`,
`interventions_mobile`) **n'est jamais effacée** → données personnelles d'un
**salarié parti** conservées sans limite. Aggrave **OPE-62** (géoloc salariés :
pas de rétention/purge). → **Ajouté à OPE-62.**

---

## Verdict

Suppression technicien **ownership-OK** mais **hard-delete sans cascade/soft-delete**
→ orphelins (data-integrity MEDIUM ; crash client possible non confirmé). Reco :
**soft-delete `inactif`** (déjà prévu au schéma). Volet géoloc-non-purgée
**consolidé dans OPE-62**. **Pas de nouvelle issue** (MEDIUM, pas de crash/sécurité
confirmé).

# Audit — Modèles de devis (templates) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : endpoints modèles du `devisRouter` — `getModeles` (`routers.ts:1153`),
> `createModele` (`:1159`), `getModeleWithLignes` (`:1171`), `addLigneToModele`
> (`:1186`), `deleteModele` (`:1219`).

---

## Conclusion : module scopé tenant. Pas de BLOCKER/HIGH.

### Multi-tenant correct (aucun IDOR)

- `getModeles` → `getModelesDevisByArtisanId(artisan.id)` (scoped).
- `createModele` → `createModeleDevis(artisan.id, …)` (scoped).
- `getModeleWithLignes` (`:1171`) → `getModeleDevisById` + `modele.artisanId !==
  artisan.id` → FORBIDDEN avant de lire les lignes.
- `addLigneToModele` (`:1186`) → même check `modele.artisanId !== artisan.id` avant
  d'ajouter une ligne (le `modeleId` parent est vérifié).
- `deleteModele` (`:1219`) → même check avant suppression.

### Pas de FK-injection sur les lignes

Aucun endpoint `deleteLigneModele`/`updateLigneModele` séparé (les lignes sont gérées
via le modèle : ajout vérifié sur le parent, suppression en cascade via `deleteModele`).
→ pas le vecteur OPE-9 (suppression de ligne par `id` sans vérif d'appartenance).

---

## Verdict

Modèles de devis : **ownership systématiquement vérifié** (`modele.artisanId ===
artisan.id`) sur lecture, création, ajout de ligne et suppression. Pas d'IDOR. **Pas
d'issue Linear.**

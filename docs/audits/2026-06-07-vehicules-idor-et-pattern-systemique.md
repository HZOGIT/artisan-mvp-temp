# Audit — Véhicules (IDOR) + pattern IDOR systémique

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `vehiculesRouter` (`routers.ts:5996`) ; + constat transverse issu
> d'un balayage des handlers tRPC sans `ctx`.

---

## 🟠 HIGH — `vehiculesRouter` : IDOR multi-tenant (lecture / écriture / suppression en cascade)

Quasiment toutes les routes « par id » du routeur véhicules sont des handlers
`async ({ input })` **sans `ctx`** → aucun contrôle d'appartenance possible ; les
helpers DB ne scopent que par `id`.

| Route | Ligne | Effet cross-tenant |
| -- | -- | -- |
| `getById` | 6002 | lit n'importe quel véhicule (immat, marque, **prixAchat**, technicien) |
| `update` | 6030 | modifie n'importe quel véhicule (immat, statut, réassignation technicien…) |
| `delete` | 6048 | **supprime en CASCADE** véhicule + kilométrage + entretiens + assurances |
| `addKilometrage` | 6054 | ajoute un relevé à n'importe quel véhicule |
| `getHistoriqueKilometrage` | 6069 | lit l'historique kilométrique d'autrui |
| `addEntretien` | 6075 | ajoute un entretien à n'importe quel véhicule |
| `getEntretiens` | 6095 | lit les entretiens d'autrui (prestataire, coût) |
| `addAssurance` | 6107 | ajoute une assurance à n'importe quel véhicule |

Helpers (`db.ts`) non scopés :
```typescript
getVehiculeById(id): .where(eq(vehicules.id, id))            // pas d'artisanId
updateVehicule(id,…): .where(eq(vehicules.id, id))
deleteVehicule(id):  // DELETE kilometrage + entretiens + assurances + vehicule (cascade)
```

### Exploitation

En itérant `id`/`vehiculeId = 1..N` : lire/modifier/**détruire** (cascade) le parc
véhicules de toutes les entreprises de la plateforme.

### Fix

Scoper chaque route via le véhicule → `vehicule.artisanId === artisan.id`
(helper `assertVehiculeOwner(vehiculeId, ctx.user.id)`), avec `ctx` dans tous les
handlers. `list` / `create` / `getEntretiensAVenir` sont déjà scopés.

### Estimation

~1 h — helper ownership + branchement (8 routes) + test cross-tenant.

---

## ⚠️ Constat transverse — pattern IDOR systémique (à remédier globalement)

Le balayage des handlers `async ({ input })` (sans `ctx`) renvoie **81
occurrences** dans `server/routers.ts`. Beaucoup sont légitimes (public/token :
signature, portail, vitrine, recherche, articles publics), mais **le même défaut
d'ownership a déjà été trouvé routeur après routeur** :

| Issue | Routeur / entité |
| -- | -- |
| OPE-9 / OPE-10 | lignes devis / devisOptions |
| OPE-30 | analyse photos (devisIA) |
| OPE-31 | notificationsPush / conges.byTechnicien (lecture) |
| OPE-38 | genererEcrituresFacture |
| OPE-45 | congés (approbation / delete / soldes) |
| OPE-46 | rapports personnalisés (executer/historique/delete) |
| **(ce run)** | **véhicules** |

→ Il ne s'agit plus de cas isolés mais d'un **défaut d'isolation multi-tenant
systémique**. Le correctif route-par-route est risqué (on en oublie). Recommandation :

1. **Inventaire complet** : auditer les ~81 handlers `({ input })` + tous les
   helpers `getXById(id)` non scopés.
2. **Garde transverse** : helper générique d'ownership (`assertOwner(entity, id,
   artisanId)`) appelé systématiquement, et/ou faire porter l'`artisanId` dans le
   `WHERE` de **tous** les `getXById`/`updateX`/`deleteX` (signature
   `(id, artisanId)`).
3. **Test e2e cross-tenant** : pour chaque entité, vérifier qu'un artisan B ne
   peut pas lire/modifier/supprimer une ressource de l'artisan A.

C'est, collectivement, un **BLOCKER de lancement** (confidentialité + intégrité
multi-tenant), au-delà de chaque issue prise isolément.

---

## Estimation totale

- HIGH (véhicules) : ~1 h
- Remédiation systémique IDOR (chantier transverse) : ~2-3 j (inventaire + garde
  générique + tests) — à prioriser globalement

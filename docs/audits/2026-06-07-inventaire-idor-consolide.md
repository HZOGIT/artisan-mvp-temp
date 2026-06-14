# Audit — Inventaire IDOR consolidé (pour la remédiation OPE-47)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Synthèse de la campagne d'audit : classification de **chaque routeur** en
> « scopé (sûr) » vs « non scopé (IDOR) ». Sert l'« inventaire complet » demandé
> par **OPE-47**. **Pas de nouvelle issue** ; posté en commentaire d'OPE-47.
> Run du jour : `techniciensRouter` vérifié **sûr** (alimente le tableau).

---

## 🔴 Routeurs NON scopés (IDOR avéré) — à corriger

| Routeur / routes | Issue |
| -- | -- |
| `devis.updateLigne` / `deleteLigne` | OPE-9 |
| **`devisOptions` (tout le routeur** : create/update/delete/select/convertirEnDevis/lignes) | OPE-10 (étendue) |
| `devisIA`/analyse photos (`getById`/`addPhoto`/`analyserPhotos`) | OPE-30 |
| `notificationsPush` (subscribe/getHistorique/getPreferences/send/…) | OPE-31 |
| `conges.byTechnicien` (lecture) | OPE-31 |
| **`conges`** (approuver/refuser/annuler/delete/getSoldes/initSolde) | OPE-45 |
| `comptabilite.genererEcrituresFacture` | OPE-38 |
| `rapports` (executer/historique/delete/toggleFavori) | OPE-46 |
| **`vehicules`** (getById/update/delete/addKilometrage/addEntretien/addAssurance/…) | OPE-47 |

→ Tous suivent le même anti-pattern : handler `async ({ input })` **sans `ctx`**
appelant `db.getXById(id)` (scopé par id seul).

---

## ✅ Routeurs SCOPÉS (vérifiés sûrs) — modèles à répliquer

| Routeur | Mécanisme |
| -- | -- |
| `clients`, `interventions`, `calendrier` | couche **`dbSecure.*Secure(id, artisanId)`** (WHERE artisanId) |
| `devis` (CRUD principal), `factures` (CRUD principal) | `getDevisByIdSecure` / `getFactureByIdSecure` |
| `chantiers` (+ enfants phases/docs/suivi) | **`assertChantierOwner`** sur **chaque** route |
| `geolocalisation` | **`assertTechnicienOwner`** |
| `techniciens` (ce run), `commandes-fournisseurs`, `rdv`, `interventionsMobile`, `contrats` (sauf create→OPE-25), `depenses` (sauf OPE-38), `modelesEmail` | **check inline** `x.artisanId !== artisan.id` |
| `notifications` (artisan) | helper `WHERE id = ? AND artisanId = ?` |
| `search.global` | `WHERE artisanId = ?` paramétré |
| routes Express PDF/export/portail | check inline (`artisanId` ou `access.clientId`) |

---

## Conclusion pour OPE-47

Le défaut d'isolation **n'est pas généralisé** : ~**9 routeurs** non scopés face à
~**15 scopés**. **3 patterns corrects coexistent déjà** dans le code (`dbSecure`,
`assertXOwner`, check inline). 

→ La remédiation = **appliquer un de ces patterns** (idéalement `assertXOwner`,
cf. `chantiers`/`geolocalisation` comme gabarits) aux 9 routeurs listés ci-dessus,
**pas** un développement neuf. Périmètre fini et cartographié → estimable
précisément (~2-3 j) et testable (1 test cross-tenant par routeur).

Critère de revue pour repérer un IDOR : **handler `async ({ input })` (sans `ctx`)
appelant `db.getXById(id)` sans comparer ensuite `.artisanId`** — le `getById`
brut n'est pas le problème (cf. `techniciens`/`commandes` qui l'utilisent
correctement), c'est l'**absence du check qui doit l'accompagner**.

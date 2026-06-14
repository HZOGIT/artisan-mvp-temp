# Audit — Router comptabilité (grand-livre / balance / journal / TVA) — OK (correctness → OPE-52)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `comptabiliteRouter` (`routers.ts:5346`) — `getEcritures`,
> `getGrandLivre`, `getBalance`, `getJournalVentes`, `getRapportTVA` /
> `getDeclarationTVA`, `getPlanComptable`, `getFecPreview`,
> `genererEcrituresFacture`.

---

## Conclusion : routeur **scopé** (pas de nouvel IDOR). Les défauts de fond sont déjà tracés.

### Isolation

Toutes les routes de lecture sont `comptaVoirProcedure` (permission
`comptabilite.voir`) + `getArtisanByUserId` → scope `artisan.id` passé aux helpers
(`getGrandLivre(artisan.id, …)`, `getRapportTVA(artisan.id, …)`…). **Pas d'IDOR.**

> Exception déjà tracée : **`genererEcrituresFacture`** est un handler
> `async ({ input })` **sans `ctx`** → IDOR (= **OPE-38**, dans l'inventaire
> OPE-47). Pas ré-ouvert ici.

### Correctness — tout le module lit une table jamais peuplée (= OPE-52)

Confirmation directe : **les 4 états comptables lisent exclusivement
`ecritures_comptables`** :

| Fonction (`db.ts`) | Source |
| -- | -- |
| `getRapportTVA` (`:2604`) | `from(ecrituresComptables)` (comptes 44571/44566) |
| `getGrandLivre` | `from(ecrituresComptables)` |
| `getBalance` | `from(ecrituresComptables)` |
| `getJournalVentes` | `from(ecrituresComptables)` WHERE `journal='VE'` |

Or `ecritures_comptables` n'est écrite **que** par la mutation manuelle
`genererEcrituresFacture` (jamais déclenchée automatiquement) → en usage normal la
table est **vide** → **grand-livre, balance, journal des ventes ET déclaration TVA
renvoient ~0** pour tout artisan. La **déclaration TVA à 0** = risque de
**sous-déclaration fiscale**.

→ **Entièrement couvert par OPE-52** (🔴 BLOCKER), qui cite déjà « Grand livre et
balance (mêmes lectures) également vides/faux ». Le `getJournalVentes` relève de la
même cause (« mêmes lectures »). **Pas de nouvelle issue ni extension** : OPE-52 est
déjà exhaustive (fix : auto-générer les écritures à la validation/avoir **ou**
calculer depuis `factures` comme le FEC).

---

## Sujets comptables connexes déjà tracés

- Format FEC non conforme (17 vs 18 colonnes) → **OPE-33** ; `getFecPreview`
  partage la même construction (cosmétique, même racine).
- IDOR `genererEcrituresFacture` → **OPE-38**.
- CA calculé en TTC → **OPE-53**. Rapprochement bancaire (dépense négative) →
  **OPE-39**.

---

## Verdict

`comptabiliteRouter` **scopé** (pas de nouvel IDOR). L'inopérance de fond du module
(toutes lectures sur `ecritures_comptables` vide) est **OPE-52** (BLOCKER, déjà
exhaustive). **Pas de nouvelle issue Linear.**

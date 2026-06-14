# Audit — `devis.duplicate` (OK) + numérotation systémique non atomique (→ OPE-34)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `devis.duplicate` (`routers.ts:913`) + balayage de tous les
> compteurs de numéro de document (`getNextXNumber/Numero`, `db.ts`).

---

## `devis.duplicate` — sain

- **Ownership** : `devis.artisanId !== artisan.id ⇒ FORBIDDEN` (`:921`).
- **Nouveau `numero`** via `getNextDevisNumber` (pas de réutilisation).
- **`statut: "brouillon"`** : la copie **ne reprend pas** un état `accepte`/signé →
  pas de devis dupliqué « déjà signé ». ✓
- Nouvelle `dateValidite` (+30 j), objet suffixé « (copie) », lignes copiées avec
  `tauxTVA` **par ligne**. ✓
- Seul écart : `protectedProcedure` (devrait être `devisCreerProcedure`) → **OPE-17**.

→ Pas d'issue propre pour le duplicate.

---

## Constat systémique — numérotation non atomique sur TOUS les documents (→ OPE-34)

Aucun compteur n'utilise de transaction/verrou/contrainte `UNIQUE`. Trois variantes,
toutes sujettes à collision sous concurrence :

| Helper | Pattern | Légal (CGI) ? | Couverture |
| -- | -- | -- | -- |
| `getNextFactureNumber` | `compteur` + `MAX(numero)`, UPDATE séparé | **Oui** | **OPE-34** |
| `getNextAvoirNumber` | idem (`typeDocument='avoir'`) | **Oui** | OPE-34 (étendu) |
| `getNextDevisNumber` (`db.ts:454`) | idem | Non | ← à inclure |
| `getNextDepenseNumero` | `SELECT … ORDER BY id DESC LIMIT 1` +1 | Non | ← |
| `getNextNoteFraisNumero` | idem | Non | ← |
| **`getNextContratNumber`** (`db.ts`) | **`COUNT(*) + 1`** | Non | ← **le plus fragile** |

**`getNextContratNumber` = bug concret (hors concurrence)** : `COUNT(*)+1`
**collisionne dès qu'un contrat est supprimé** (5 contrats → suppression → count=4
→ prochain `CTR-00005` = déjà existant). Indépendant de toute course.

→ Le correctif d'**OPE-34** (allocation atomique + `UNIQUE(artisanId, numero[, typeDocument])`)
devrait être **générique** à tous les compteurs ; priorité légale = facture/avoir,
les autres = intégrité de données ; et `getNextContratNumber` doit abandonner le
`COUNT(*)` au profit d'un compteur monotone. **Ajouté à OPE-34** par commentaire.

---

## Verdict

`devis.duplicate` **vérifié sain** (ownership, reset brouillon, numéro frais,
lignes/TVA correctes). La seule trouvaille est la **numérotation non atomique
systémique** — consolidée dans **OPE-34** (avec le cas `getNextContratNumber`
`COUNT(*)` qui collisionne à la suppression). **Pas de nouvelle issue.**

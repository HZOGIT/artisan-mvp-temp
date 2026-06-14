# Benchmark/QA — Sweep « arrays d'entrée non bornées → DoS » (classe OPE-24 problème 2)

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe de bug)

> Sweep de **toutes** les entrées `z.array(...)` de `server/routers.ts` qui **bouclent des
> écritures DB** sans `.max()`. Classe : DoS par saturation du pool (N `INSERT` séquentiels).

---

## Méthode

`grep "z.array(" server/routers.ts` → 13 sites. Filtrés sur ceux qui (a) n'ont **pas** de
`.max()` et (b) **bouclent** des écritures DB dans la mutation.

## ✅ Déjà bornés (sains)

- `importFromExcel.clients` (`:375`) → **`.max(5000)`** ✓ (le « problème 2 » d'OPE-24,
  `importFromExcel`, est désormais **corrigé**).
- `importClients`/`importDevis`/`importFactures.rows` (`:8528/:8586/:8653`) → `.max(5000)` ✓.
- `commandes.recevoir.lignes` (`:3965`) → `.max(500)` ✓.
- `rapports … colonnes` (`:6192/:6212`) → `.max(100)` ✓.

## ❌ Non bornés + boucle d'écriture (à corriger)

| Endpoint | Ligne | Boucle | Risque |
|---|---|---|---|
| `createAvoir.lignes` | `:1884` | `for (ligne of input.lignes) … db.createLigneFacture` (×2) | N INSERT lignes d'avoir |
| `commandesFournisseurs.create.lignes` | `:3794` | `for … db.createLigneCommandeFournisseur` | N INSERT lignes commande |
| `commandesFournisseurs.update.lignes` | `:3867` | delete + `for … createLigneCommandeFournisseur` | N INSERT lignes commande |
| `notesFrais.create.depenseIds` | `:9318` | `for (did of input.depenseIds) … db.addDepenseToNoteFrais` | N écritures de liaison |

Tous `protectedProcedure` (artisan authentifié). Avec le body global **50 Mo** (cf. OPE-24
problème 3), un seul appel peut contenir des **dizaines de milliers** d'objets → INSERT
**séquentiels** (`await` par itération) → **saturation du pool MySQL**, app dégradée pour **tous**
les tenants. Un document légitime (devis/avoir/commande) a < 100 lignes → borne sans impact.

## Severité & action

**MEDIUM** (authentifié, auto-limité par le cap 50 Mo, mais saturation pool = impact multi-tenant).
Même **classe** que le **problème 2 d'OPE-24** (array sans `.max()`). **Anti-doublon : OPE-24
enrichi** par commentaire (pas de nouveau ticket — quasi-doublon). À distinguer d'**OPE-181**
(`importBibliothequeArticles` : non borné **+ bypass admin-only sur table globale**, HIGH, ticket
dédié). Reco : `.max(500)` (lignes de document) / `.max(1000)` (`depenseIds`), + idéalement
insertion par batch.

> Note Odoo : `account.move`/`purchase.order` n'imposent pas de limite « dure » mais persistent
> les lignes via l'ORM en **une transaction batchée** (`create()` multi-records), pas N round-trips
> séquentiels — d'où l'intérêt secondaire du batch insert ici (perf), au-delà de la borne (DoS).

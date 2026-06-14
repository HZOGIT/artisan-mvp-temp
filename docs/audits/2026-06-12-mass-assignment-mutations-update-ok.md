# Audit — Mass-assignment & IDOR sur les mutations `update` — OK (1 exception déjà filée)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin

> Périmètre : sweep des mutations `update*` de `server/routers.ts` et des `db.updateX(id, data)`
> correspondants (`server/db.ts`). Risques recherchés : (a) **mass-assignment** d'un champ
> sensible (`artisanId`, `id`, `plan`/`role`/`subscription`, totaux/`statut`/`montantPaye`) via
> un input trop permissif ; (b) **IDOR en écriture** — `db.updateX(...).where(eq(X.id, id))` met à
> jour **par id seul** (pas de scope `artisanId`), donc l'ownership doit être vérifié au routeur.

---

## Conclusion : pattern sain et cohérent. Aucun BLOCKER/HIGH nouveau.

Les `db.updateX` font tous `.set(data).where(eq(X.id, id))` (update par id, **sans** scope tenant
en base) — mais **chaque routeur** applique systématiquement les deux gardes :

### 1. Ownership vérifié avant l'update (pas d'IDOR écriture)

- `stock.update` (`:3196`) : `stock.artisanId !== artisan.id ⇒ NOT_FOUND`.
- `fournisseurs.update` (`:3408`) : `fournisseur.artisanId !== artisan.id ⇒ NOT_FOUND`.
- `techniciens.update` (`:5333`) : `technicien.artisanId !== artisan.id ⇒ NOT_FOUND`.
- `devis.updateLigne` (`:925-937`) : ownership du **devis parent** + la **ligne doit appartenir au
  devis** (OPE-9) avant `updateLigneDevis`.
- `devisOptions.*` : `assertDevisOwner` (`:6038`).
- `clients.update` / `factures.update` : `getClientByIdSecure` / `getFactureByIdSecure` (scopés
  `artisan.id`).

### 2. Input = liste blanche Zod (pas de mass-assignment)

Les inputs `update` sont des `z.object({...})` **sans** `artisanId`/`userId`/`id`-spoof. Zod
**strippe les clés inconnues** → impossible d'injecter un champ hors-schéma. Vérifié notamment :
- `artisan.updateProfile` (`:208`) : **aucun** `plan`/`role`/`subscription`/`maxUsers` →
  pas d'escalade de privilège/facturation (cf. aussi `config-import-articles-ok`).
- `stock.update` : **pas** de `quantiteEnStock` (les variations passent par `adjustStock` +
  mouvement) → quantité non mass-assignable.
- `factures.update` (`:1504`) : pas de `totalHT/TVA/TTC`, `updateData` construit **champ par
  champ** (pas de spread brut), **verrou** des factures non-`brouillon` (contenu figé) + garde de
  **transitions de statut**.

### 3. Montants recalculés serveur (jamais pris de l'input)

`devis.updateLigne` recompute `montantHT/TVA/TTC = quantite × prixU × (1+TVA)` puis
`recalculateDevisTotals` ; `factures.update` n'accepte aucun total. → les montants de documents ne
sont **pas** mass-assignables.

---

## Exceptions / déjà filé

- **`depenses.update`** : mass-assignment documenté séparément (`2026-06-09-depenses-update-mass-assignment.md`).
- **Fuite cross-tenant via FK en LECTURE** (`getXById` non scopé renvoyé dans un objet composite) :
  classe **distincte** (lecture, pas écriture), déjà systémique **OPE-47** (ex. fournisseur via
  `getById` de commande).
- `factures.markAsPaid` force `payee` sans comparer `montantPaye`/`totalTTC` : **OPE-60** (logique
  de règlement, pas mass-assignment).

## Verdict

Les mutations `update` sont **uniformément protégées** : ownership au routeur + input Zod en
liste blanche + montants recalculés serveur. La garde « update par id seul » en base est
**compensée** par la vérification d'ownership systématique. **Pas d'issue Linear** (exceptions
connues déjà filées : depenses-update, OPE-47, OPE-60).

# Audit — Dépenses : `update` générique expose `statut`/`rembourse` (auto-remboursement) → OPE-63

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `depensesRouter` (`routers.ts:8383`), `depenses.update` (`:8457`),
> `updateDepense` + `DEPENSE_FIELD_MAP` (`db.ts:5805`), schéma `depenses`.

---

## Ce qui est sain

- **Tenant-scoping OK** : `getById`/`update`/`delete`/`stats` passent `artisan.id` aux
  fonctions DB (`getDepenseById(id, artisan.id)`, `updateDepense(id, artisan.id, …)` →
  `WHERE id=? AND artisan_id=?`, `deleteDepense(id, artisan.id)`). Pas d'IDOR
  cross-tenant.
- **Mass-assignment borné** : `updateDepense` ne writeé que les clés présentes dans la
  whitelist `DEPENSE_FIELD_MAP` (`if (!col) continue;`). Pas d'écriture de colonnes
  arbitraires (`id`, `artisan_id` non mappés).

## 🟠 HIGH — auto-approbation via `update` générique → rattaché à **OPE-63**

`depenses.update` accepte `data: z.record(z.any())` (objet libre) et `DEPENSE_FIELD_MAP`
**inclut les champs d'état** : `statut`, `rembourse`, `dateRemboursement`. Donc, en
`protectedProcedure` (aucune permission, `getArtisanByUserId` résout les
collaborateurs) :

```
depenses.update({ id: <ma_depense>, data: { statut: "remboursee", rembourse: true } })
```

→ un `technicien` marque **sa propre** dépense `remboursée` (charge + TVA récupérable
« validée ») **sans** créer/soumettre de note de frais, **sans** approbateur.

**Distinct du chemin d'OPE-63** (endpoints `approuver/payer NoteFrais`) : le fix d'OPE-63
(garde de permission + approbateur ≠ demandeur sur ces endpoints) **ne ferme pas** ce
contournement par l'`update` générique. → **OPE-63 étendu par commentaire** : le fix doit
aussi retirer `statut`/`rembourse`/`dateRemboursement` de la whitelist du `update`
générique (transitions d'état réservées au circuit contrôlé). Pas de doublon.

---

## Verdict

Dépenses : tenant-scoping et whitelist corrects, **mais** le `update` générique expose
les champs d'état (`statut`/`rembourse`) → auto-remboursement hors workflow, **même
classe qu'OPE-63** via un chemin distinct → rattaché par commentaire. **Pas de nouvelle
issue Linear.**

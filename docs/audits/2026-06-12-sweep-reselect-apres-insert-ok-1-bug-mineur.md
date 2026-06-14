# QA — Sweep « reselect après insert » (classe OPE-176) : sain sauf 1 bug mineur (biblio admin). Pas de ticket benchmark.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (passe de QA correctness)

> Après le BLOCKER OPE-176 (relecture par `numero` non scopée → cross-tenant), sweep de **tous**
> les `db.insert(...)` suivis d'une **relecture par champ** dans `server/db.ts`, pour débusquer
> d'éventuels frères du bug.

---

## Relectures par **champ unique/global** → saines ✅

| Ligne | Champ | Pourquoi sûr |
| -- | -- | -- |
| 185/192/3463 | `users.email` | email = login **globalement unique** → 1 seul user |
| 240/250 | `artisans.slug` | `slug` est **`.unique()`** (schema) |
| 1259/1282/1301 | `signaturesDevis.token` | `token` est **`.unique()`** (64c) |

## Relectures **scopées tenant** → saines ✅

| Ligne | Fonction | Scope |
| -- | -- | -- |
| 424 | `createArticleArtisan` | `and(eq(artisanId), eq(reference))` ✅ |
| 494 / 628 / 5326 | `createDevis` / `createFacture` / (devis) | `and(eq(artisanId), eq(numero))` ✅ |
| 656 | `createFactureFromDevis` | **corrigé OPE-176** (scopé + `orderBy desc id`) ✅ |

→ **Aucun autre cross-tenant** de ce pattern. OPE-176 était **isolé**.

---

## 🐛 Bug mineur trouvé (non cross-tenant) : `createBibliothequeArticle`

`server/db.ts:382-384` relit par une colonne **inexistante** :

```ts
await db.insert(bibliothequeArticles).values(data);
const result = await db.select().from(bibliothequeArticles)
  .where(eq(bibliothequeArticles.reference, data.reference))   // ❌ pas de colonne `reference`
  .limit(1);
return result[0];
```

- `bibliotheque_articles` (`schema.ts:94`) n'a **pas** de colonne `reference` (champs :
  `metier, categorie, sous_categorie, nom, description, prix_base, unite, …`), et l'input
  (`routers.ts:503`) n'a pas de `reference` non plus → `bibliothequeArticles.reference` /
  `data.reference` = **`undefined`** → la relecture est **cassée** (throw / résultat vide).
- **Impact : faible.** Endpoint **`adminOnly`** (seuls les admins Operioz créent des articles de
  la bibliothèque **globale** partagée) ; la biblio est de toute façon plutôt **seedée**. Pas de
  tenant, pas de données financières. Mais l'endpoint **échoue** s'il est appelé.
- **Fix (quick, candidat auto-fix)** : relire la ligne via l'**`insertId`**, ou par un champ
  réel + `orderBy(desc(id)).limit(1)` (ex. `eq(nom)` + tri), comme `createBadge`/`createNotification`.
  Pas une migration. **Behavior-changing** (cassé→fonctionnel) donc à traiter explicitement.

---

## Verdict

Le pattern « reselect après insert » est **sain** sur tout le périmètre tenant/financier
(OPE-176 isolé, déjà corrigé). Seul résidu : `createBibliothequeArticle` relit une **colonne
inexistante** (`reference`) → endpoint **admin** cassé, **faible impact**, **pas un gap Odoo**
donc **pas de ticket benchmark** — noté ici comme **candidat correctif rapide** (auto-fix/audit).

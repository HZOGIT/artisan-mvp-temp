# Audit — Fournisseurs : associations article↔fournisseur (IDOR) — relève d'OPE-47

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `fournisseursRouter` (`routers.ts:3030`). Le CRUD fournisseur est
> sain ; **4 routes d'association article↔fournisseur** présentent l'IDOR
> systémique d'**OPE-47**. Étendu par commentaire, pas de nouvelle issue.

---

## Ce qui fonctionne correctement

- `list` (`dbSecure.getFournisseursByArtisanIdSecure`), `getById`/`update`/
  `delete` : chargent puis vérifient `fournisseur.artisanId !== artisan.id`
  (`:3045,:3086,:3102`). `create` rattache `artisanId`. **Pas d'IDOR** sur le CRUD.

---

## 🟠 Relève d'OPE-47 — 4 routes d'association sans `ctx` ni ownership

```typescript
// routers.ts:3110-3139 — handlers async ({ input }) SANS ctx
getArticleFournisseurs: .query(({ input }) => db.getArticleFournisseurs(input.articleId))
getFournisseurArticles: .query(({ input }) => db.getFournisseurArticles(input.fournisseurId))
associateArticle:       .mutation(({ input }) => db.createArticleFournisseur(input))   // articleId+fournisseurId+prixAchat arbitraires
dissociateArticle:      .mutation(({ input }) => db.deleteArticleFournisseur(input.id)) // suppression par id seul
```

| Route | Ligne | Effet cross-tenant |
| -- | -- | -- |
| `getArticleFournisseurs` | 3110 | lit les fournisseurs (et **`prixAchat`**) de n'importe quel `articleId` |
| `getFournisseurArticles` | 3116 | lit les articles fournis par n'importe quel `fournisseurId` |
| `associateArticle` | 3122 | crée une association article↔fournisseur arbitraire (+ `prixAchat`, `referenceExterne`) |
| `dissociateArticle` | 3134 | supprime n'importe quelle association (par `id`) |

### Impact

- **Fuite de données commerciales sensibles** : le **`prixAchat`** (prix d'achat
  fournisseur) et `referenceExterne` d'un autre artisan sont lisibles en itérant
  `articleId`/`fournisseurId = 1..N` → exposition des marges/coûts d'achat des
  concurrents.
- **Écriture cross-tenant** : pollution du catalogue d'un autre tenant
  (`associateArticle`) et **suppression** de ses associations (`dissociateArticle`)
  → sabotage / corruption de données.

### Fix

Ajouter `ctx` + vérification d'appartenance **du fournisseur ET de l'article** à
`artisan.id` sur les 4 routes (les deux entités ont une colonne `artisanId`) :
charger `getFournisseurById`/`getArticleById` et comparer `.artisanId`, et pour
`dissociateArticle` vérifier l'appartenance via l'association → fournisseur. À
inclure dans le chantier de remédiation systémique d'OPE-47.

### Estimation

~30 min (dans le lot OPE-47).

---

## Conclusion

`fournisseursRouter` ajoute **4 routes** à l'inventaire IDOR d'**OPE-47**, avec une
**fuite de `prixAchat`** (donnée commerciale sensible) + écriture/suppression
cross-tenant. CRUD fournisseur sain. **Pas de nouvelle issue — OPE-47 étendu par
commentaire.**

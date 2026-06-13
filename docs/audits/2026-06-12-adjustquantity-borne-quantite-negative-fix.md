# Fix (MODE A) — `stocks.adjustQuantity` : quantité non bornée → une quantité NÉGATIVE inverse une `sortie`

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (robustesse, auto-infligé)

> `stocksRouter.adjustQuantity` (`server/routers.ts:3118`). Réserve documentée dans
> `docs/audits/2026-06-09-stocks-inventaire-ok.md` (point 2), désormais corrigée.

---

## Constat

L'input `quantite: z.number()` n'avait **aucune borne basse**. `adjustStock`
(`db.ts:1038`) calcule `newQty = type === 'sortie' ? currentQty - quantity : currentQty + quantity`.

Une **quantité négative** passée à une `sortie` **inverse** l'opération :
`currentQty - (-5)` = `currentQty + 5` → une « sortie » **augmente** le stock. Idem une `entree`
négative le **diminue**. Le front pose pourtant `min="0"` (`Stocks.tsx:679`), mais l'**API** ne
l'enforçait pas (appel scripté / hors UI).

## Fix appliqué (`server/routers.ts:3121`)

```ts
quantite: z.number().min(0).max(100_000_000),
```
(+ `motif: z.string().max(255).optional()` — colonne `text`, borne anti-bloat ; `reference`
était déjà borné `max(100)`.)

- **Behavior-preserving** : un mouvement légitime (`entree`/`sortie`/`ajustement`) porte une
  quantité **≥ 0** (le front n'envoie jamais de négatif) → inchangé. Seules les quantités
  **négatives** (inversion) ou **aberrantes** sont rejetées en 400.
- **Blast radius** : une entrée d'API, ownership déjà vérifié au routeur. Pas de logique
  financière (mouvement de stock opérationnel, compta basée factures).

> Distinct des autres réserves stock : **atomicité** (read-modify-write) rattachée à **OPE-104**,
> **stock négatif sur sortie légitime** (backorder, autorisé comme Odoo) non bloquant, et la
> sémantique **« Ajustement (inventaire) » additive** enrichie sur **OPE-129**.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Réserve issue d'un audit **-ok** (pas d'issue dédiée) — durcissement de validation. **Pas d'issue
Linear** ; documenté ici.

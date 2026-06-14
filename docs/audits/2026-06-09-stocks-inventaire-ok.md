# Audit — Stocks / inventaire (CRUD + mouvements) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `stocksRouter` (`routers.ts:2832-2990`), `db.adjustStock` (`db.ts:970`),
> `getMouvementsStock`, `getLowStockItems`, schéma `stocks`/`mouvements_stock`
> (`schema.ts:332-365`).

---

## Conclusion : module bien isolé. Pas de BLOCKER/HIGH.

### Multi-tenant correct (pas d'IDOR)

Tous les endpoints vérifient l'appartenance avant lecture/écriture :
- `list` → `dbSecure.getStocksByArtisanIdSecure(artisan.id)` (`:2837`).
- `getById`/`update`/`delete`/`adjustQuantity`/`getMouvements` → `getStockById` puis
  `stock.artisanId !== artisan.id` → NOT_FOUND (`:2847/2889/2904/2925/2937`).
- `create` scope `artisanId: artisan.id` (`:2869`). `getLowStock`/`generateAlerts`
  scopés `artisan.id`.

→ Impossible de lire/modifier le stock d'un autre artisan.

### Pas d'impact financier/légal

Le stock est **opérationnel** (alertes seuil + rapport de réapprovisionnement) et **ne
nourrit pas** la comptabilité légale (écritures/FEC/TVA sont **basées factures**, cf.
OPE-52). Une inexactitude d'inventaire n'a donc pas d'effet fiscal/légal.

---

## Réserves mineures (qualité de données, non bloquantes, pas d'issue)

1. **`adjustStock` non atomique** (`db.ts:970-978`) : lit `currentQty`, calcule
   `newQty`, puis écrit — **read-modify-write** sans transaction ni `UPDATE ... SET qty
   = qty ± n`. Sous accès concurrent → **lost update**. Impact faible (inventaire mono-
   tenant, faible concurrence). Reco : update atomique SQL.
2. **Aucune garde de stock négatif** : `type === 'sortie' ? currentQty - quantity`
   (`:976`) peut produire une quantité **négative**, sans rejet ni clamp. Data-quality.
3. **`quantite: z.number()` non `.positive()`** (`:2914`) : une quantité **négative**
   passée à une `sortie` **inverse** l'opération (`currentQty - (-5)` = +5). Auto-
   infligé (inventaire de l'artisan lui-même), mais à durcir (`z.number().positive()` +
   garde serveur).

→ Ces trois points sont de la **robustesse/qualité de données**, pas des blockers
lancement.

---

## Anti-doublon

Aucune issue existante sur le module stocks. Les constats étant mineurs (robustesse),
**pas d'issue Linear**.

---

## Verdict

Stocks : **multi-tenant correct** (pas d'IDOR), **sans impact financier/légal**
(inventaire opérationnel, compta basée factures). Réserves robustesse :
`adjustStock` non atomique, pas de garde stock négatif, `quantite` non `.positive()`.
Non bloquant. **Pas d'issue Linear.**

# Audit — Rapprochement bancaire (import relevé + transactions) — OK (DoS rattaché à OPE-24)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `importReleve` (`routers.ts:8721`), `getTransactionsBancaires` (`:8764`),
> `convertirTransaction` (`:8773`). Table `transactions_bancaires`.

---

## Conclusion : module scopé tenant. Pas de BLOCKER/HIGH nouveau.

### Multi-tenant correct (aucun IDOR)

- `importReleve` : auth (`getArtisanByUserId` → FORBIDDEN), insère via
  `db.importReleve(**artisan.id**, …)` → transactions rattachées au tenant.
- `getTransactionsBancaires` (`:8769`) : `db.getTransactionsBancaires(**artisan.id**,
  releveId?)` → `artisan.id` est le scope **primaire**, `releveId` un filtre secondaire.
  Un `releveId` d'un autre tenant ne renvoie rien (`WHERE artisanId=? AND releveId=?`).
- `convertirTransaction` (`:8783-8785`) : lit la liste **scopée** `getTransactionsBancaires(artisan.id)`
  puis `.find(x => x.id === transactionId)` → ne convertit qu'une transaction du tenant.

→ Pas de fuite/altération cross-tenant des données bancaires.

### Réserves = déjà tracées

- **`importReleve` sans limite de lignes** → insert massif non borné (CSV volumineux →
  N INSERT → saturation pool). Même classe que **OPE-24** (Problème 2, `importFromExcel`)
  → **OPE-24 étendu par commentaire** (importReleve à borner dans le même fix).
- **Signe debit négatif** (`:8751`, `montant = credit>0 ? credit : -abs(debit)`) puis
  `convertirTransaction` réutilise le montant → dépenses à montant négatif / TVA
  déductible faussée → déjà **OPE-39**.

---

## Verdict

Rapprochement bancaire : **IDOR-clean** (scope `artisan.id` sur lecture, import et
conversion). Les deux réserves sont **déjà couvertes** : DoS d'import → OPE-24 (étendu),
montants négatifs → OPE-39. **Pas de nouvelle issue Linear.**

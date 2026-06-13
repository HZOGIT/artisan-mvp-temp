# Audit — Rapprochement bancaire : cloisonnement OK, idempotence conversion MEDIUM

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `comptabilite` — `getTransactionsBancaires` (`routers.ts:8858`),
> `convertirTransaction` (`:8867`), `ignorerTransaction` (`:8904`) + helpers DB
> (`getTransactionsBancaires`, `lierTransactionDepense`).

---

## Conclusion : pas d'IDOR. Idempotence de conversion absente (MEDIUM, sous le seuil). Pas de nouveau BLOCKER/HIGH.

### ✅ Cloisonnement multi-tenant correct (pas d'IDOR)

- `getTransactionsBancaires(artisanId, releveId?)` (`db.ts`) : `WHERE artisan_id = ?
  AND ignoree = FALSE` (+ `releve_id` optionnel) `LIMIT 500`. Un `releveId` cross-tenant ne
  renvoie **rien** (scopé par `artisan_id`). Borné à 500.
- `convertirTransaction` (`:8867`) : ne fait **pas** de fetch-by-id direct ; il charge la
  liste **scopée** de l'artisan (`getTransactionsBancaires(artisan.id)`) puis
  `find(x.id === input.transactionId)` → un `transactionId` d'un autre tenant donne
  `undefined` → `NOT_FOUND`. **Bon pattern.**
- `ignorerTransaction(id, artisan.id)` et `lierTransactionDepense(txId, depId, artisan.id)`
  scopent par `artisan_id` dans le `WHERE`. ✅
- Division HT : `montantTtc / 1.2` (constante) → pas de division par zéro.

### 🟡 MEDIUM — pas d'idempotence : double-conversion = dépense en double

`lierTransactionDepense` (`db.ts:6359`) marque la transaction convertie via
`SET depense_id = ?`. **Mais** `getTransactionsBancaires` n'exclut **que** `ignoree = FALSE`
— **pas** les transactions ayant déjà un `depense_id`. Et `convertirTransaction` ne vérifie
**pas** `t.depense_id` avant de créer la dépense.

→ Convertir la **même** transaction deux fois (double-clic / re-visite) crée **deux**
dépenses (`createDepense`) ; la 2ᵉ écrase `depense_id`, orphelinant la 1ʳᵉ. Résultat :
**dépenses dupliquées** dans les livres (impact FEC/déduction TVA si validées).

**Cadrage** : pas de cross-tenant ; livres **propres** de l'artisan ; dépenses créées en
statut **`brouillon`** (revue avant validation) ; déclenché par une action manuelle répétée.
→ **MEDIUM** (intégrité comptable d'une feature secondaire), **sous** le seuil BLOCKER/HIGH.
Même **classe** qu'OPE-68 (convertToFacture sans idempotence) mais sur les dépenses
brouillon (impact moindre : pas de facturation client, pas de doc finalisé).

**Fix (candidat auto-fix safe, behavior-preserving)** : dans `convertirTransaction`, après
le `find`, **refuser si déjà convertie** :
```ts
if (t.depense_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction déjà convertie en dépense" });
```
et/ou exclure `depense_id IS NOT NULL` de la liste convertible côté `getTransactionsBancaires`.
La 1ʳᵉ conversion reste identique ; seules les re-conversions sont bloquées.

### Écart connu — déjà filé

`convertirTransaction` peut créer une dépense à **montant négatif** (transaction = crédit/
encaissement converti en dépense) → **OPE-39**. Pas de doublon.

---

## Verdict

Le rapprochement bancaire est **correctement cloisonné** (scope `artisan_id` partout, conversion
via liste scopée + `find`, LIMIT 500) → **pas d'IDOR, pas de nouveau BLOCKER**. Un défaut
d'**idempotence** sur `convertirTransaction` (double-conversion → dépenses dupliquées) =
**MEDIUM** (livres propres, brouillon) → **sous le seuil, pas d'issue Linear**, mais
**candidat auto-fix safe** (garde `if (t.depense_id) …`). Montants négatifs = **OPE-39**.

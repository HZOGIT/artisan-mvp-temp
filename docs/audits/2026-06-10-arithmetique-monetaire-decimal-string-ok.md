# Audit — Intégrité de l'arithmétique monétaire (DECIMAL renvoyé en string) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : calculs de totaux/accumulations monétaires côté serveur —
> `recalculateDevisTotals` (`db.ts:544`), `recalculateFactureTotals` (`db.ts:751`),
> agrégations compta/CA (`db.ts:2561,2719,2775`), totaux commandes (`db.ts:1205`),
> stats factures + accumulation `montantPaye` (`routers.ts:7187`), `markAsPaid`
> (`routers.ts:1470`).

---

## Conclusion : aucune corruption monétaire par concaténation. Pas de BLOCKER/HIGH.

Risque cherché : le driver **mysql2 (et Drizzle) renvoient les colonnes `DECIMAL` en
`string`**. Un `+` sur deux strings **concatène** (`"100.00" + "50.00"` → `"100.0050.00"`)
→ montants corrompus. Classique et silencieux.

### Les recalculs de totaux parsent explicitement

- `recalculateDevisTotals` (`:551-555`) :
  `const montantHT = parseFloat(ligne.montantHT?.toString() || '0'); totalHT += montantHT;`
  → accumulateurs initialisés à **`0` (number)** + opérandes **parsés** → addition
  numérique correcte, sortie `.toFixed(2)`.
- `recalculateFactureTotals` (`:759-760`) : idem (`parseFloat(ligne.montantHT?.toString())`).

### Les agrégations compta/CA parsent aussi

`db.ts:2561-2562` (débit/crédit), `:2719` (CA TTC), `:2775` (CA mensuel) :
tous en `parseFloat(String(x || '0'))`. Pas de concat.

### Les totaux « calculés » sont des nombres (coercition par `*`)

`db.ts:1198` `montantTotal: quantiteACommander * prixUnitaire` → la **multiplication
coerce** les strings en nombres (`5 * "10.00" === 50`), donc `montantTotal` est un
**number**. Le `reduce((sum, l) => sum + l.montantTotal, 0)` (`:1205`) additionne donc
`0 + number` → **number** (pas de concat).

### Côté routers

- `routers.ts:7192` `montantPaye += ttc` : `montantPaye` initialisé à `0`, `ttc` parsé →
  addition numérique.
- `markAsPaid` (`:1470`) `montantPaye: input.montantPaye` : **stockage** direct de la
  string dans la colonne DECIMAL (pas d'arithmétique) → OK.

---

## Réserve (déjà filée / LOW)

- **Arrondi par ligne vs sur le total** : la TVA est arrondie **par ligne** (`.toFixed(2)`
  à la création) puis sommée ; un PDF/recalcul qui appliquerait le taux sur le **total HT**
  peut différer d'un **centime**. C'est le périmètre de « PDF : TVA à un taux unique »
  (déjà filé). Pas de doublon.

---

## Verdict

L'arithmétique monétaire est **systématiquement protégée** : `parseFloat(x?.toString() ||
'0')` avant addition, accumulateurs à `0` numérique, totaux calculés via `*` (coercition).
**Aucune concaténation de montants**. Le seul résiduel (arrondi par ligne) est **déjà
tracé**. **Pas de nouvelle issue Linear.**

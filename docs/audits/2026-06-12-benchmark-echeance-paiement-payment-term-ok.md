# Benchmark — Échéance de paiement (`computeDateEcheance`) vs Odoo `account.payment.term` — ✅ CORRECT

**Date** : 2026-06-12 · **Domaine** : Paiements / échéances · **Type** : vérification de correctness (pas de gap bloquant)
**Verdict** : la dérivation de la date d'échéance est **correcte** et **fidèle aux conventions FR** ; cohérente entre les deux chemins de création de facture. 1 gap mineur (variantes Odoo non couvertes) — **pas de ticket** (relève d'OPE-94, enrichi en commentaire).

---

## Notre état

`computeDateEcheance(base, jours, type)` (`server/db.ts:728`) :
```ts
const d = new Date(base);
d.setDate(d.getDate() + (jours || 0));          // base + N jours
if (type === "fin_de_mois") {
  d.setMonth(d.getMonth() + 1, 0);              // → dernier jour de CE mois (après +N jours)
}
return d;
```
- `net` = base + N jours.
- `fin_de_mois` = base + N jours, **puis** dernier jour du mois obtenu.

Paramétré par artisan (`parametres_artisan.delaiPaiementJours` + `delaiPaiementType` ∈ {`net`,`fin_de_mois`}, OPE-94), exposé via `defaultDateEcheance(artisanId, base)` (`db.ts:739`).

### Application — cohérente sur les DEUX chemins ✓
- **Création directe** de facture (`routers.ts:1493-1495`) : `dateEcheance = input.dateEcheance ?? defaultDateEcheance(artisan.id, dateFacture)`.
- **Conversion devis→facture** (`db.ts:763`) : `dateEcheance = defaultDateEcheance(devisData.artisanId, new Date())`.
- Si aucun délai n'est paramétré → `undefined` (comportement historique préservé ; la facture n'a pas d'échéance et n'est jamais marquée « en retard » — voir `db.ts:666` qui dérive l'échu de `dateEcheance < NOW()`).

## Odoo 19 (`addons/account/models/account_payment_term.py:294-327`)

`delay_type` ∈ :
- `days_after` → `due_date + relativedelta(days=nb_days)` (ligne 327).
- `days_after_end_of_month` → `end_of(date,'month') + nb_days` (**fin de mois PUIS +N jours**, ligne 314).
- `days_after_end_of_next_month` → fin du mois **suivant** + N jours (ligne 316).
- `days_end_of_month_on_the` (ligne 317-326) :
  - `days_next_month` vide/0 → **`end_of(date + nb_days, 'month')`** (ligne 324) = **+N jours PUIS fin de mois**.
  - sinon → `date + nb_days`, puis `mois+1, jour = days_next_month` (« le X du mois suivant »).

## Correspondance (vérifiée)

| Operioz | Sémantique | Équivalent Odoo |
|---|---|---|
| `net` | base + N jours | `days_after` ✓ |
| `fin_de_mois` | base + N jours **puis** fin de mois | `days_end_of_month_on_the` avec `days_next_month=0` (ligne 324) ✓ |

→ **Nos deux variantes correspondent exactement à deux `delay_type` Odoo** et à des conventions FR légalement admises (« X jours fin de mois » au sens « +N jours puis fin du mois »). **Pas de bug de calcul.**

### Edge-cases vérifiés
- Roulement de mois : `setDate(+N)` gère le passage de mois (JS natif). `setMonth(m+1, 0)` = dernier jour du mois courant (28/29/30/31 corrects).
- Ex. 15/01 + 30 j `fin_de_mois` : 15/01 +30 = 14/02 → fin de mois = **28/02** (cohérent avec Odoo `days_end_of_month_on_the`/0).
- `jours = 0` géré (`|| 0`).

## Gap mineur (NON bloquant — relève d'OPE-94, pas de nouveau ticket)

Odoo couvre **4** `delay_type`, nous **2**. Manquent :
1. **`days_after_end_of_month`** (« fin de mois PUIS +N jours ») — l'**autre** interprétation FR de « X jours fin de mois », aussi admise par la DGCCRF. Donne un résultat différent de notre `fin_de_mois` (ex. 15/01 « 30 j fin de mois » méthode EOM-puis-jours = 31/01 +30 = **02/03**).
2. **`days_end_of_month_on_the` avec jour précisé** (« le 10 du mois suivant ») — paiement à date fixe, courant chez les syndics/grands comptes.

Impact : faible (notre `fin_de_mois` reste une convention valide et la plus simple) ; à considérer comme **enrichissement** d'OPE-94 si un artisan demande la convention « fin de mois le 10 ». **Aucune action requise pour le 30 juin.**

## Conclusion

Calcul d'échéance **correct et conforme** aux conventions FR, **cohérent** sur les deux chemins de création. Domaine au niveau d'Odoo pour le périmètre MVP. Enrichissement (variantes supplémentaires) noté sur OPE-94. **Pas de ticket créé.**

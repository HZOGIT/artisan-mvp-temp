# Audit — Scheduler : dépenses récurrentes (idempotence) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : génération automatique des **dépenses récurrentes** par le scheduler
> horaire (`index.ts:1424-1501`). Risque ciblé : double-création (cf. OPE-40 pour
> les factures de contrat manuelles).

---

## Conclusion : pas de BLOCKER/HIGH. La génération récurrente est idempotente.

### Mécanisme & idempotence

```sql
-- index.ts:1440 — sélection
WHERE recurrente = TRUE AND prochaine_occurrence IS NOT NULL
  AND prochaine_occurrence <= CURDATE() LIMIT 50
```

Pour chaque dépense due : (1) INSERT d'une copie (`statut='brouillon'`,
`date_depense=CURDATE()`, nouveau `numero` via `getNextDepenseNumero`), puis
(2) **avance `prochaine_occurrence`** de l'intervalle (hebdo/mensuel/trim./annuel) :

```sql
-- index.ts:1473
UPDATE depenses SET prochaine_occurrence = DATE_ADD(prochaine_occurrence, INTERVAL …) WHERE id = ?
```

→ Le scheduler tourne **toutes les heures** ; après traitement,
`prochaine_occurrence` repasse **dans le futur**, donc la même dépense **ne
re-matche plus** `<= CURDATE()` le même jour. **Pas de doublon** sur le cas
nominal. La copie est `recurrente=FALSE` (pas de récursion en cascade). Erreurs
par ligne isolées (`try/catch` interne) → une ligne en échec n'interrompt pas le
lot. Création en `brouillon` → l'artisan révise avant impact comptable.

---

## Réserves (mineures, pas d'issue)

1. **Fenêtre INSERT→UPDATE non transactionnelle** : si le process **crashe**
   exactement entre l'INSERT de la copie et l'UPDATE de `prochaine_occurrence`, la
   dépense garde son ancienne échéance → re-création au prochain run (doublon).
   Probabilité **très faible** (fenêtre de quelques ms, instance unique). Durcir :
   envelopper les deux requêtes dans une **transaction**.

2. **Numérotation `DEP-XXXXX` non atomique** (`getNextDepenseNumero`) — même schéma
   que la numérotation facture (**OPE-34**), mais les **dépenses ne sont pas
   soumises** à l'obligation légale de séquence des factures → impact faible.

3. **Course à la bascule d'essai (lié à OPE-66/OPE-29)** : à l'étape 2 du scheduler
   (`index.ts:1330`, `UPDATE … SET status='expired' WHERE status='trialing' AND
   trial_ends_at < NOW()`), un abonnement **Stripe en essai** qui arrive à
   échéance peut être marqué `expired/plan='expired'` **avant** que le webhook
   Stripe (`subscription.updated` → `active`) ne le convertisse → bref lockout /
   reset de plan, **auto-réparé** au prochain événement Stripe. Disparaît si OPE-66
   (retrait du trial Stripe) est corrigé. Faible impact, self-healing.

---

## Verdict

Dépenses récurrentes **idempotentes** sur le cas nominal (avance de
`prochaine_occurrence`), erreurs isolées, création en brouillon. Réserves :
fenêtre INSERT/UPDATE non atomique (crash-window, très faible) et une course de
bascule d'essai déjà liée à OPE-66. **Pas d'issue Linear créée.**

> Vérifié au passage : `commandesFournisseursRouter` (`genererDepuisDevisIA` checke
> `devis.artisanId !== artisan.id` + rate limit) — déjà couvert par
> `2026-06-07-commandes-relances-calendrier-ok.md`.

# Benchmark/QA — Facture `en_retard` jamais positionné auto : statut mort. Déjà OPE-61 (enrichi).

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness, factures/échéances)

> `factures.statut` (`drizzle/schema.ts`), `runScheduler` (`server/_core/index.ts:1475`),
> `updateStatut` (`server/routers.ts:1499`), `getEncoursClient` (`server/db.ts:626`, OPE-144)
> ↔ Odoo `account.move.invoice_date_due` (retard **calculé depuis la date**, pas de flag stocké).

---

## Constat (vérifié)

Le statut `en_retard` de l'enum facture **n'est jamais positionné automatiquement** quand
`dateEcheance` passe :
- Écriture de `en_retard` dans tout `server/` → **uniquement** la transition **manuelle**
  `updateStatut` (`routers.ts:1499`, map `envoyee → [payee, en_retard]`). Aucun `UPDATE`/`.set()`
  programmatique.
- `runScheduler` (`index.ts:1475`, horaire, **prod-only** `:1674`) traite : sessions expirées,
  bascule trials, emails J-3/J-1, dépenses récurrentes. **Aucune bascule de statut facture/devis.**

## Conséquences

- ✅ **Résilient** (calcul depuis la date) : le total « impayées » du dashboard
  (`statut NOT IN ('payee','annulee','brouillon')`) et `generateOverdueReminders` (retard depuis
  `dateEcheance`) **fonctionnent** sans dépendre du statut.
- ❌ **Mort** (dépend de `statut='en_retard'`) :
  - **OPE-144** part « échue » (`getEncoursClient`, livrée ce jour, commit `236270c`) → toujours **0 €**.
  - filtre **assistant** `en_retard` (`assistantTools.ts:357`), badges/vues keyés sur ce statut.
  - déclenchement des **pénalités de retard L441-10** (OPE-95) ne peut pas s'appuyer dessus.

## Odoo 19

`account.move` **ne stocke pas** de flag « overdue » : `invoice_date_due` + tout calcul (aged
receivable, `account_followup`, affichage) dérive de `invoice_date_due < today`. → rien à
maintenir, pas de job qui peut « oublier » de tourner.

## Anti-doublon / action

Déjà couvert par **OPE-61** (Lancement 30 juin, HIGH — « factures jamais en_retard auto » +
volet devis `expire`/validité). **Pas de nouveau ticket.** OPE-61 **enrichi** d'un commentaire :
(1) la dépendance morte d'OPE-144 (échu) + filtre assistant ; (2) reco affinée — pour les
**montants/déclenchements légaux**, calculer « échu » depuis **`dateEcheance < NOW()`** (aligné
Odoo, robuste au scheduler) plutôt que depuis le statut, en plus du job de bascule (utile pour les
filtres/badges). Heads-up posté aussi sur **OPE-144**. Lien dérivation échéance : **OPE-94**.

# Benchmark — Relances / recouvrement (factures impayées) vs Odoo `account_followup` : gap **déjà filé** (OPE-131)

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Comparaison : le suivi des **factures impayées** (relances graduées + mise en demeure) ↔
> Odoo 19 *Follow-up* (`account_followup` : niveaux de relance par retard, statut de suivi
> par client/facture, actions email/courrier/litige). Grounding OSS : `account_move.no_followup`,
> calcul `overdue_installments` + cadre légal FR (recouvrement amiable). **Proposition uniquement.**

---

## Conclusion : domaine **déjà couvert** par les tickets benchmark. Aucun nouveau ticket — enrichissement d'OPE-131.

### État Operioz (vérifié dans le code)

- **Relance câblée = devis uniquement.** `relancesRouter` (`server/routers.ts:7664`) +
  `relances.envoyerRelance` / `envoyerRelancesAutomatiques` (`:1148` / `:1212`), déclenchés
  **manuellement depuis l'UI**, opèrent sur `getDevisNonSignes`. Table `relances_devis`.
- **Facture impayée = 0 relance automatique.** La table `config_relances_auto`
  (`drizzle/schema.ts:1542`) existe (jours, nombre max, modèle…) mais **aucun scheduler ne la
  consomme** : `runScheduler` (`server/_core/index.ts:1443`) ne fait que sessions/trials/J-3/J-1.
  `rappel_paiement` n'est qu'un **type de modèle** (`:3401`), jamais envoyé sur une facture en retard.
- Le tableau de bord **expose** `facturesImpayees` (count + total, `server/db.ts:1535`) → la
  donnée est là, mais sans moteur de relance derrière.

### Odoo 19 (équivalent)

- `account_followup` : **niveaux** (delay/action/email par palier), **statut de suivi** par
  client, relance multi-canaux, marquage litige. Calcul du retard par échéance.
- Cadre légal FR : recouvrement amiable par **paliers** (rappel → relance ferme → **mise en
  demeure** LRAR avec pénalités L441-10 + indemnité forfaitaire 40 €), prérequis à l'injonction.

### Anti-doublon — déjà tracé

| Aspect | Ticket |
| --- | --- |
| Niveaux escaladés + **mise en demeure** (cœur du gap `account_followup`) | **OPE-131** (High) — *enrichi ce jour* : `config_relances_auto` non câblé au scheduler → 0 relance facture auto |
| Mentions de retard (taux pénalité + 40 €) **sur la facture** | OPE-95 |
| **Alerte encours / impayés** avant d'émettre un nouveau doc (client à risque) | OPE-165 |
| Table des **règlements** (plusieurs paiements / dates) | OPE-94 |
| **Échéance** calculée + conditions de paiement structurées | OPE-159 |

---

## Verdict

Le **recouvrement** (relance des factures impayées, niveaux, mise en demeure) est un **gap
réel et structurant** pour un artisan — mais **déjà couvert** par **OPE-131** (et le cluster
OPE-95/165/94/159). Vérification code ce jour : la lacune est **plus profonde** que le titre
d'OPE-131 ne le laissait croire (`config_relances_auto` existe mais **n'est branché sur aucun
scheduler** → la facture impayée ne reçoit **aucune** relance auto). J'ai **enrichi OPE-131**
avec cette précision de grounding plutôt que créer un doublon. **Aucun nouveau ticket benchmark.**

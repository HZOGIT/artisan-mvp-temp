# Audit — Contrats : facturation récurrente non automatisée (aucun scheduler)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟡 MEDIUM**

> Périmètre : `contrats.generateFacture` (`routers.ts:4378`), `facturesRecurrentes`
> (`db.ts:2956-2966`), boucle `runScheduler` (`index.ts:1334-1535`), champ
> `contrat.periodicite`.

---

## Constat : le contrat a une périodicité, mais rien ne génère les factures automatiquement

### Ce qui existe

- `contrats.generateFacture(contratId)` (`:4378`) : **procédure manuelle**
  (`protectedProcedure`) → crée 1 facture + 1 ligne depuis le contrat, puis journalise
  l'événement dans `facturesRecurrentes` (`:4430`). La facture porte la note
  « Facture générée **automatiquement** pour le contrat » (`:4405`).
- `facturesRecurrentes` n'est **que** : écrit par `createFactureRecurrente` (log), lu par
  `getFacturesRecurrentesByContratId` (affichage sur la fiche contrat, `:4272`). **Ce
  n'est pas une file d'échéances à traiter**, c'est un historique.
- `contrat.periodicite` ∈ {mensuel, trimestriel, semestriel, annuel} (`:4423-4427`).

### Ce qui manque

`runScheduler` (`index.ts:1334-1535`) traite : sessions, expiration trials, emails
J-3/J-1/J+3, **dépenses récurrentes** (bloc 6) — **mais aucun bloc ne génère les factures
de contrats à échéance**. `grep` : aucune lecture de `contrat.periodicite` /
`facturesRecurrentes` à des fins de génération planifiée.

→ **Asymétrie révélatrice** : l'auto-génération a été implémentée pour les **dépenses**
récurrentes, **pas** pour les **factures** de contrats. Couplé au commentaire « générée
automatiquement » et au champ `periodicite`, cela ressemble à un **oubli** plutôt qu'à un
choix de design.

### Impact (MEDIUM)

Un artisan qui crée un **contrat mensuel** s'attend à une facturation **récurrente
automatique** (cœur de la promesse « contrats/abonnements »). Or il doit **cliquer
manuellement** chaque période → **revenu perdu** s'il oublie, et fonctionnalité qui ne fait
pas ce qu'elle implique. Pas de corruption ni de faille — le chemin manuel **fonctionne** →
**MEDIUM** (dégradé, pas mort), sous le seuil BLOCKER/HIGH.

---

## Distinction (anti-doublon)

- Issue déjà filée « **Contrats : generateFacture sans garde d'idempotence/échéance →
  double facturation** » = bug du **endpoint manuel** (double-clic → 2 factures). Elle ne
  couvre **pas** l'**absence de scheduler** (automatisation jamais déclenchée). Sujets
  complémentaires sur le même flux. → **Pas de doublon** ; à **rattacher** à cette issue
  comme second volet (« et automatiser la génération à l'échéance »).

---

## Reco

1. **Confirmer l'intention produit** : contrats = facturation **automatique** (alors il
   manque un bloc scheduler qui, à chaque échéance `periodicite`, appelle un
   `generateFacture` **idempotent**) — ou **manuelle assistée** (alors retirer
   « automatiquement » du libellé et ajouter une **relance** « facture du contrat X à
   émettre »).
2. Si automatique : réutiliser le pattern du **bloc 6** (dépenses récurrentes) pour les
   contrats, avec garde d'idempotence par période (cf. issue double-billing) **et**
   transaction (cf. OPE-84).

---

## Verdict

La **facturation récurrente des contrats n'est pas automatisée** (aucun scheduler ; seules
les **dépenses** récurrentes le sont). Le chemin manuel fonctionne → **MEDIUM** (revenu/
promesse), sous le seuil HIGH, **rattaché** à l'issue contrat double-billing existante.
**Pas de nouvelle issue Linear** ; intention produit à confirmer.

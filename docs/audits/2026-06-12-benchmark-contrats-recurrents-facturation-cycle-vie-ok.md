# Benchmark/QA — Contrats récurrents : facturation & cycle de vie ✅ (vérif correctness — gaps déjà filés, aucun nouveau ticket)

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA de correctness)

> Vérification de **correctness** du domaine **contrats de maintenance récurrents** (`contrats_maintenance`,
> `factures_recurrentes`) ↔ Odoo *subscription* / `account` (récurrence `recurring_next_date`).
> Points à risque examinés : **scoping multi-tenant**, **idempotence** de la génération de facture,
> **cascade de suppression** (préservation des documents légaux). Aucune découverte de gap nouveau :
> les écarts sont **déjà tracés**. Note anti-doublon (pas de ticket).

---

## Périmètre lu

- `contratsRouter` : `generateFacture` (`server/routers.ts:5083-5147`), `delete` (`:5067-5080`).
- `server/db.ts` : `deleteContrat` (`:3657-3668`), `createFactureRecurrente` (`:3681`), `getFacturesRecurrentesByContratId` (`:3674`).
- `drizzle/schema.ts` : `contrats_maintenance` (`:661`), `factures_recurrentes` (`:691`).

## ✅ Vérifié CORRECT

### 1) Scoping multi-tenant — sain sur les 2 chemins
- `generateFacture` : `contrat.artisanId !== artisan.id → FORBIDDEN` (`:5091`). ✓
- `delete` : même garde d'ownership avant `deleteContrat` (`:5075`). ✓

### 2) Cascade de suppression — correcte (OPE-177), documents légaux préservés
`deleteContrat` (`db.ts:3657`) supprime uniquement les **enfants opérationnels / de liaison** :
```ts
await db.delete(facturesRecurrentes).where(eq(facturesRecurrentes.contratId, id)); // table de LIAISON
await db.delete(interventionsContrat).where(eq(interventionsContrat.contratId, id)); // visites
await db.delete(contratsMaintenance).where(eq(contratsMaintenance.id, id));
```
→ Les **factures générées** par le contrat **NE sont PAS supprimées** (seul le lien `factures_recurrentes` l'est). Conforme à la rétention légale (CGI) : un document fiscal finalisé ne disparaît pas avec son contrat d'origine. ✓ ↔ Odoo : supprimer un abonnement ne supprime pas les `account.move` postés.

## 🟠 Écarts de correctness — TOUS DÉJÀ FILÉS (anti-doublon → pas de nouveau ticket)

### A) Idempotence / échéance de `generateFacture` → **OPE-40** (HIGH, *Lancement 30 juin*) — **confirmé NON corrigé ce jour**
Relecture de `:5083-5147` : la mutation **crée inconditionnellement** une facture (`statut: "envoyee"`) + une ligne + une `factures_recurrentes`, **sans** :
- vérif d'échéance (`now >= contrat.prochainFacturation`) ;
- vérif de doublon de période (aucun `SELECT` dans `factures_recurrentes`) ;
- contrainte DB `UNIQUE(contratId, periodeDebut)`.
→ Double-clic / retry / futur scheduler ⇒ **double facturation** (deux `envoyee`, corrigibles par **avoir** seulement). **Dérive de cycle** confirmée : `periodeFin`/`prochainFacturation` calculés depuis **`now`** (`:5126-5144`) et non depuis l'échéance planifiée → une génération **tardive** décale le cycle de facturation (le client est facturé moins souvent que contractuellement). Le statut `envoyee` est posé **sans** `sendEmail`, et la ligne est créée **sans** `montantTVA` (ni `recalculateFactureTotals`). **Tout ceci est déjà décrit dans OPE-40** (mêmes points, réfs de lignes à jour : `:5083` au lieu de l'ancien `:4369`). ↔ Odoo : `recurring_next_date` avance **depuis la date planifiée** avec idempotence via l'enregistrement de récurrence.

### B) Modèle de règlements (paiements partiels) → **OPE-116** (filé)
`factures.markAsPaid` (`:1711`) **écrase** `montantPaye` (pas d'agrégation) et force `statut: "payee"` **inconditionnellement** — un règlement partiel marque la facture **entièrement payée** ; pas de table de règlements ni de reste à payer. Scoping ✓, garde date invalide ✓, écritures idempotentes ✓ (delete-then-insert par `factureId`). Le manque de modèle multi-règlements est **OPE-116**.

### C) Génération automatique (scheduler) → **OPE-140** / **OPE-132**
Pas d'auto-génération des factures (**OPE-140** — volet **indicateur** « Contrats à facturer » livré ce jour, commit `9e20ef7`) ni des visites (**OPE-132**). **OPE-140 dépend d'OPE-40** (ne pas brancher l'auto-génération tant que l'idempotence n'est pas en place, sinon double-facturation automatisée).

## Verdict

Le **scoping** et la **cascade de suppression** (préservation des factures légales) du domaine contrats récurrents sont **corrects**. Les **deux risques de correctness** (idempotence/échéance de `generateFacture`, modèle de règlements partiels) et les volets d'automatisation sont **déjà filés** (OPE-40, OPE-116, OPE-140, OPE-132) et **à jour**. **Aucun nouveau ticket benchmark** — la vérification confirme qu'aucun BLOCKER caché ne manque au backlog. Reco de séquencement rappelée : **OPE-40 avant OPE-140** (idempotence avant auto-génération).

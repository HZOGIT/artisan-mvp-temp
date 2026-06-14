# Audit — Fuseau horaire : dates fiscales calculées en UTC (date de facture/FEC/TVA décalée d'un jour)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : config TZ conteneur (`docker-compose.staging.yml`, `.env.staging`,
> `Dockerfile`), date d'émission facture (`routers.ts:1288`, `schema.ts:186`), formatage
> FEC (`index.ts:539-541`), bornes mensuelles CA/TVA (`db.ts:1537+`).

---

## 🟠 HIGH — le serveur tourne en UTC, mais les dates fiscales sont attribuées en local UTC

Produit de **facturation/compta française** : la **date d'émission** d'une facture est sa
date **légale** (FEC, période de TVA). Or :

1. **Aucun `TZ` configuré** → conteneur en **UTC** : `grep -i 'TZ=|timezone|Europe/Paris'`
   sur `docker-compose.staging.yml` / `.env.staging` / `Dockerfile` = **0 résultat**.
2. La date d'émission est posée **côté serveur** :
   ```typescript
   // routers.ts:1288 (facturesRouter.create)
   dateFacture: new Date(),
   ```
   (+ défaut schéma `dateFacture: timestamp(...).defaultNow()`, `schema.ts:186` ; idem
   `dateDevis`, `:139`.) → c'est l'**instant UTC** de création.
3. La restitution fiscale reformate avec les méthodes **locales (= UTC)** :
   ```typescript
   // index.ts:539-541 (fecDate, EcritureDate du FEC)
   const y = date.getFullYear(); const m = date.getMonth()+1; const day = date.getDate();
   ```
   idem bornes mensuelles CA/TVA (`db.ts:1537,1605…` : `now.getFullYear()/getMonth()`).

### Conséquence concrète

Paris été = UTC+2. Une facture émise le **1er juin à 00h30 Paris** →
`new Date()` = `2026-05-31T22:30:00Z` → `dateFacture` enregistrée et restituée au **31 mai**.

→ Pour toute facture créée **entre 00h00 et 02h00 (heure de Paris)** :
- **date d'émission légale fausse** (PDF + enregistrement) d'un jour ;
- **FEC** : `EcritureDate` au mauvais jour → fichier légal incorrect ;
- **TVA** : facture rattachée au **mois (voire à l'année au 1er janvier) précédent** →
  déclaration de TVA erronée ;
- au passage d'**exercice** (1er janvier 00h–02h), rattachement à l'**année fiscale
  précédente**.

Silencieux (aucune erreur). Fréquence faible (créneau de 2 h) mais **non nulle**, et
l'impact porte sur des **documents légaux**.

### Ce qui n'est PAS touché (cadrage)

- `markAsPaid` : `datePaiement = new Date(input.datePaiement)` — date **choisie par
  l'artisan** (date-only) → pas de drift serveur (stable).
- `numero` facture = compteur (`FAC-00001`), **sans année/mois** (`db.ts:612`) → pas de
  drift de numérotation.

---

## Distinction (anti-doublon)

- « Export FEC non conforme (17 vs 18 colonnes) » et « écritures jamais générées » = format
  / génération des écritures. **Aucune** issue ne traite le **fuseau horaire** des dates.
- « Numérotation non atomique » = unicité/atomicité, pas la date. → **pas de doublon.**

---

## Fix proposé

- **Pragmatique (lancement France)** : poser **`TZ=Europe/Paris`** sur le conteneur
  backend (env `docker-compose.staging.yml` + prod) **et** la session MySQL (`time_zone`)
  pour les colonnes `defaultNow()` → `new Date()` et `DATE()` raisonnent en heure de Paris.
- **Robuste (multi-TZ)** : calculer explicitement les dates fiscales en `Europe/Paris`
  (ex. `Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris'})` ou `date-fns-tz`) pour
  `dateFacture`, `fecDate`, et les bornes mensuelles CA/TVA — indépendamment du TZ système.
- Ajouter un test : facture créée à `23:30Z` un 31/12 → `dateFacture` = **01/01** (Paris).

---

## Verdict

Le serveur attribue les **dates fiscales en UTC** (conteneur sans `TZ`, `new Date()` +
formatage local) → factures émises 00h–02h Paris **datées la veille** : date légale, FEC
et période de TVA **décalées d'un jour** (et d'année au 1er janvier). Cœur de métier
(facturation FR conforme), silencieux, fix trivial. **🟠 HIGH → issue Linear créée.**

# Benchmark/QA — RDV en ligne : `confirm` crée une intervention sans contrôle de conflit de créneau

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, planning/RDV)

> `rdvEnLigne.confirm` (`server/routers.ts:~8050`), `getCreneauxOccupes` (`db.ts:3575`),
> `demanderRdv` (`routers.ts:4591`) ↔ Odoo `appointment` / `calendar.event` (dispo ressource
> vérifiée avant création). **Enrichit OPE-110** (même classe : conflit de planification).

---

## ✅ Sain

- `getCreneauxDisponibles` (`:4550`) exclut bien les créneaux occupés via `getCreneauxOccupes`
  (interventions non annulées + RDV `en_attente`/`confirme`, scope `artisanId`, test de
  chevauchement `slotStart < occEnd && slotEnd > occ.dateDebut`). ✓
- `demanderRdv` : bornes de date (24h / 2 ans), garde NaN, throttle `checkPortalActionRate`. ✓
- `confirm`/`refuse` : ownership `rdv.artisanId === artisan.id`, garde `statut === 'en_attente'`. ✓

## ❌ Le contrôle de créneau est **à l'affichage seulement** (TOCTOU)

`demanderRdv` insère la `dateProposee` **sans** re-vérifier la disponibilité (un appel direct /
client obsolète peut proposer un créneau occupé). Surtout, **`confirm` crée l'intervention sans
aucun contrôle de chevauchement** :

```ts
const dateFin = new Date(rdv.dateProposee.getTime() + (rdv.dureeEstimee||60)*60000);
await db.createIntervention({ ..., dateDebut: rdv.dateProposee, dateFin, statut: "planifiee" });
```

→ deux demandes sur le même créneau peuvent **toutes deux** être confirmées → **double-booking**
sur l'agenda de l'artisan. (Déjà noté MEDIUM dans `2026-06-11-rdv-en-ligne-booking-flow-ok.md`
point 2 ; jamais ticketé.)

## Impact / sévérité

**MEDIUM** — atténué par l'humain dans la boucle (l'artisan confirme manuellement et voit ses
demandes). Mais c'est la **panne de planning** classique, et elle touche même l'artisan **solo**
(là où le volet `assignerTechnicien` d'OPE-110 ne s'applique pas). Pas un BLOCKER 30 juin.

## Odoo 19

`appointment`/`calendar.event` : la **disponibilité de la ressource** (calendrier − événements
existants) est vérifiée **avant** de créer le RDV — pas seulement un filtre d'affichage.

## Action

**Enrichissement d'OPE-110** (même classe « conflit de planification ») : ajouter `rdvEnLigne.confirm`
comme 3ᵉ site, réutiliser le helper existant `getCreneauxOccupes` (exclure le RDV courant) pour
avertir/bloquer. **Pas de nouveau ticket.** Commenté sur OPE-110.

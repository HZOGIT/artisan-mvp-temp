# Benchmark/QA — RDV en ligne (prise de RDV portail) : scoping + validation ✅ OK (1 item déjà tracé)

**Date** : 2026-06-13 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe sécurité/correctness endpoint public) · **Domaine** : Planning / RDV en ligne (`rdv_en_ligne` ↔ Odoo `appointment` / `calendar`)

> Vérification de **correctness + sécurité** du flux de **demande de RDV depuis le portail client** (endpoint **public**) et de sa **contre-proposition** côté artisan. Risques : injection de `artisanId`/`clientId` (cross-tenant), dates malformées (colonne `dateProposee` NOT NULL), flood, pollution de données (dates absurdes), double-booking.

---

## ✅ `demanderRdv` (public, `routers.ts:4973`) — durci sur tous les axes

| Axe | Garde | Verdict |
|---|---|---|
| **Tenant** | `artisanId`/`clientId` dérivés du **token portail** (`getClientPortalAccessByToken`), **jamais** de l'input → pas d'injection cross-tenant | ✓ |
| **Auth** | token invalide/expiré → `UNAUTHORIZED` (`:4983`) | ✓ |
| **Anti-flood** | `checkPortalActionRate(artisanId:clientId)` (OPE-24) → `TOO_MANY_REQUESTS` (crée un RDV + notifie à chaque appel) | ✓ |
| **Date NaN** | `isNaN(dateProposee)` → `BAD_REQUEST` AVANT insertion (sinon `NaN < minDate` = false contournerait le contrôle, colonne NOT NULL) | ✓ |
| **Borne basse** | `dateProposee >= now + 24h` (`:4996`) | ✓ |
| **Borne haute** | `dateProposee <= now + 2 ans` (`:5002`) → rejette année 9999 / pollution | ✓ |
| **Bornes texte** | `titre` 1–200, `description` ≤ 5000, `urgence` enum | ✓ |

→ C'est une **demande** (statut en attente), pas une réservation ferme : l'artisan **confirme** ensuite. Aucune écriture sensible, pas de montant. Comportement aligné Odoo `appointment` (un créneau demandé reste à valider).

## ✅ `proposeAutreCreneau` (artisan, `routers.ts:8800`) — ownership + atomicité d'ordre

- **Ownership** : `rdv.artisanId !== artisan.id` → `NOT_FOUND` (`:8807`). `clientId` repris du RDV existant (scopé), pas de l'input.
- **Garde date NaN placé AVANT** le `refuse` (`:8814`) : sinon on refuserait l'ancien RDV **puis** planterait à la création du remplaçant (état incohérent « refusé sans remplaçant »). Ordre correct.

## ✅ Disponibilité des créneaux (`getCreneauxDisponibles`, `routers.ts:4932`)

Test de chevauchement **demi-ouvert** `slotStart < occEnd && slotEnd > occ.dateDebut` (`:4960`) — correct (créneaux contigus non faussement bloqués), même math que le planning (cf. `benchmark-planning-conflits-technicien-ok`).

## 🔗 Item déjà tracé (pas de doublon)

- **Conflit de créneau à la CONFIRMATION** d'un RDV par l'artisan — <issue href="https://linear.app/operioz/issue/OPE-251">OPE-251</issue> (RDV confirm / chevauchement). La `demanderRdv` ne vérifie volontairement pas le conflit (c'est une demande) ; le contrôle pertinent est à la **confirmation**, déjà filé. Pas de re-ticket.

## Odoo 19

`appointment`/`calendar` : un rendez-vous pris en ligne est rattaché à la ressource/partenaire courant (jamais à un tenant arbitraire) ; bornes de date (lead time min, fenêtre max) ; le slot booké vérifie la disponibilité au moment de la confirmation. Operioz atteint l'équivalent MVP : demande token-scopée + bornée + throttlée, confirmation côté artisan (conflit = OPE-251).

---

## Verdict

Le flux **RDV en ligne** (demande portail + contre-proposition) est **sain** : `artisanId`/`clientId` **toujours** dérivés du token (pas d'injection cross-tenant), **validation de date complète** (NaN / +24h / +2 ans), **anti-flood**, bornes texte, ownership et **ordre d'opérations atomique** côté artisan. Test de chevauchement de créneaux correct. **Aucun BLOCKER/HIGH** → **pas d'issue Linear** (le seul axe ouvert, conflit à la **confirmation**, est déjà OPE-251).

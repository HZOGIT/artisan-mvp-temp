# Benchmark — Portail client (`clientPortalRouter`) vs Odoo `portal` : parité MVP (et au-delà)

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `clientPortalRouter` (`server/routers.ts:3891-4446`) + `portailRouter` +
> téléchargements PDF/paiement (`index.ts`) ↔ Odoo `portal` (espace client : voir
> commandes/factures, signer un devis, payer).

---

## Conclusion : le portail client **dépasse** le `portal` Odoo OSS au niveau MVP. Rien à proposer (le seul écart est déjà filé). Aucun ticket.

### ✅ Couverture fonctionnelle riche

| Capacité | Operioz | Odoo `portal` |
| -- | -- | -- |
| Voir ses **devis / factures** | `getDevis`, `getFactures` (+ PDF) | ✅ |
| Voir ses **interventions / contrats / chantiers** | `getInterventions`, `getContrats`, `getSuiviChantiers` | partiel |
| **Signer** un devis en ligne | flow signature + OTP SMS | ✅ |
| **Payer** une facture | Stripe checkout (token + scope) | ✅ (acquirers) |
| **Demander une modification** | `demanderModification` (+ throttle OPE-24) | — |
| **Demande structurée par IA** | `soumettreDemandeIA` (rate-limité) | — (au-delà) |
| **Chat** client ↔ artisan | `getConversations`/`sendClientMessage` | — (au-delà) |
| **Prendre RDV** en ligne | `getCreneauxDisponibles`/`demanderRdv` | — (au-delà) |

→ Operioz **dépasse** l'espace client Odoo OSS (chat, RDV, demande IA, suivi chantier) —
exactement les interactions qu'un **client d'artisan** attend.

### ✅ Sécurité du portail déjà auditée (9 notes)

`portail-client-data-scoping-ok`, `portail-client-token-modele-ok`,
`portail-client-acces-token-ok`, `portail-pdf-download-idor-ok`,
`client-portal-router-api-publique-ok`, `rdv-en-ligne-portail-client-ok`,
`stripe-checkout-portal-saas-ok` : **token révocable + `isActive`/`expiresAt` forcés en DB**,
scope `access.clientId` sur **toutes** les lectures/écritures, **pas d'IDOR**, PDF et
paiement scopés. Throttle anti-flood ajouté (OPE-24, `checkPortalActionRate`).

### Écart à valeur — **déjà filé**

- **Sélection d'options de devis** par le client au portail (les variantes existent mais
  `select` est artisan-only) : **OPE-146**.

### Écarts restants = ERP / hors MVP

- Portail **multi-documents B2B** (bons de livraison, relevés de compte), **e-signature
  qualifiée eIDAS** avancée (notre signature + hash = OPE-55), **self-service de mise à
  jour des coordonnées avec validation** : au-delà du besoin artisan B2C.

---

## Verdict

Le **portail client** est **au niveau MVP d'Odoo `portal` et le dépasse** (chat, RDV,
demande IA, suivi chantier), avec une **sécurité solide et abondamment auditée**
(token-scopé, pas d'IDOR, throttlé). Le seul écart de valeur (sélection d'options au
portail) est **déjà filé (OPE-146)**. Le reste relève de l'**ERP B2B**. **Aucun nouveau
ticket benchmark.**

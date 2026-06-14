# Benchmark — Fiche client « 360° » (`ClientDetail`) vs Odoo `res.partner` (smart buttons) : parité fonctionnelle. Pas de ticket (enrichissement OPE-144).

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `client/src/pages/ClientDetail.tsx` + `clients.getById` (`server/routers.ts:274`)
> ↔ Odoo `res.partner` (form view : smart buttons + `total_invoiced`).

---

## Conclusion : la fiche client **360° existe** et est au niveau MVP. Aucun nouveau ticket ; précision d'implémentation ajoutée à OPE-144.

### ✅ Vue 360 présente (parité smart-buttons Odoo)

`ClientDetail.tsx` agrège et affiche, pour le client :

| Indicateur | Operioz | Odoo `res.partner` |
| -- | -- | -- |
| CA total facturé | `totalFacture` (`:127`) | `total_invoiced` |
| Encours / impayés | `facturesImpayees` (`:131`) | (account) |
| Devis en attente | `devisEnAttente` (`:135`) | smart button Devis |
| Interventions terminées | `interventionsTerminees` (`:136`) | smart button tâches |
| Onglets historique (devis/factures/interventions + compteurs) | `:360+` | smart buttons |
| Accès portail client | `clientPortal.getStatus`/`generateAccess` | portail |

→ Fonctionnellement **équivalent** à la fiche partenaire Odoo (le réflexe « tout l'historique
du client en un écran » est couvert).

### ⚠️ Caveat d'implémentation (≠ feature) → rattaché à OPE-144

Ces agrégats sont calculés **côté navigateur** à partir des listes **complètes et non bornées**
de l'artisan (`devis.list`/`factures.list`/`interventions.list`, sans `.limit()` —
`db.ts:446/581/786`), puis filtrées par `clientId`. → ouvrir une fiche client **télécharge
tout l'historique** ; ne scale pas. **Reco** (commentée sur **OPE-144**, dont l'**encours** est
précisément l'un de ces agrégats) : un endpoint **`clients.getStats(clientId)`** **agrégé en
SQL** (mirror `res.partner.total_invoiced` + read_group) sert l'alerte d'encours **et** la fiche
existante, en remplaçant le « fetch-tout-puis-filtre ».

---

## Verdict

La **fiche client 360°** est **au niveau MVP** (parité smart-buttons `res.partner`). Le seul
écart est d'**implémentation** (agrégation client-side sur listes non bornées), **rattaché à
OPE-144** (l'encours par client en est le cœur) plutôt qu'ouvert en doublon. **Aucun nouveau
ticket benchmark.**

> Vérifié aussi ce firing (parité, pas de ticket) : **réponse de l'artisan aux avis** est
> **pleinement implémentée** (écriture `routers.ts:5389` + affichage public `Vitrine.tsx:520`).

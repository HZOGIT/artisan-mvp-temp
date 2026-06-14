# Audit — Exports en lot PDF / Factur-X (mémoire, event-loop, bornes) — OK (réserves MEDIUM)

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `/api/comptabilite/export-pdf-lot` (`index.ts:747`),
> `export-facturx-lot` (`:701`) — génération d'un ZIP de factures sur une période.

---

## Sécurité & mémoire : OK

- **Tenant-scopé** : `authFromCookie` → `artisan.id` ; `getFacturesByArtisanId(artisan.id)`
  → uniquement les factures du tenant. Pas d'IDOR. (Le paywall sur ces routes Express =
  OPE-81, déjà filé.)
- **Mémoire bornée** : le ZIP est **streamé** (`archive.pipe(res)` + `archive.append(...)`
  par facture + `finalize()`). Chaque buffer PDF/XML est généré, poussé dans le flux, puis
  GC — **pas** de rétention simultanée de tous les PDF en RAM → pas d'OOM par accumulation.

---

## 🟡 Réserves MEDIUM (perf/disponibilité, non bloquantes au lancement)

1. **Génération PDF synchrone dans une boucle non bornée → blocage de l'event-loop.**
   `generateFacturePDF` (jsPDF) est **synchrone et CPU-bound**. La boucle
   `for (const facture of factures)` (`:776-783`) n'a **aucune borne** (plage de dates
   libre → potentiellement *toutes* les factures du tenant). Sur un serveur **mono-thread
   mono-instance**, générer N PDF d'affilée **bloque l'event-loop** pendant toute la durée
   → **tous les tenants** voient le serveur gelé le temps de l'export (≈ N × ~10-50 ms).
   À l'échelle du lancement (artisans neufs, peu de factures) l'impact est faible ; il
   **croît avec le volume** de données.

2. **N+1 séquentiel** : `getLignesFacturesByFactureId` + `getClientById` **par facture**
   (`:777-778`) → un export de 500 factures = ~1000 requêtes séquentielles → temps long +
   **une connexion** du pool (`connectionLimit:10`) monopolisée ; plusieurs exports
   concurrents → contention du pool pour tous.

3. **Filtre de date en JS** : `getFacturesByArtisanId` charge **toutes** les factures puis
   `.filter()` par date en mémoire (`:714-718`, `:760-764`) au lieu d'un `WHERE` SQL →
   O(N) inutile.

### Classe DoS adjacente

Ces points relèvent de la même classe que **OPE-24** (« opérations coûteuses sans borne /
rate-limit : importFromExcel, body 50 MB »). → **rattacher** à OPE-24 plutôt que dupliquer.
Self-service (pas cross-tenant), bornes faibles au lancement → **MEDIUM**, sous le seuil
HIGH.

---

## Reco

- **Borner** l'export (max N factures par requête, ou pagination/asynchrone avec lien de
  téléchargement) ; refuser une plage trop large.
- **Filtrer en SQL** (`WHERE dateFacture BETWEEN ? AND ? AND statut NOT IN (...)`) au lieu
  de charger-puis-filtrer.
- **Précharger** lignes/clients en 2 requêtes groupées (anti N+1).
- **Ne pas bloquer l'event-loop** : `await new Promise(setImmediate)` entre itérations, ou
  génération PDF dans un worker thread.

---

## Verdict

Exports en lot : **tenant-scopés** et **mémoire streamée** (pas d'OOM). Réserves =
**event-loop bloqué** par la génération PDF synchrone non bornée + **N+1** + filtre JS →
**perf/disponibilité MEDIUM**, croissant avec le volume, **classe OPE-24**. Sous le seuil
BLOCKER/HIGH au lancement. **Pas de nouvelle issue Linear** (rattacher à OPE-24).

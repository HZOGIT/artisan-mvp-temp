# Audit — `getTodayInterventions` : scope intra-tenant (technicien voit tout) — OK (réserve LOW-MEDIUM)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `interventionsMobile.getTodayInterventions` (`routers.ts:4526-4547`).

---

## Conclusion : pas d'IDOR cross-tenant. Réserve = minimisation intra-tenant.

### Cloisonnement tenant correct (pas d'IDOR)

`getInterventionsByArtisanId(artisan.id)` (`:4535`) avec `artisan` =
`getArtisanByUserId(ctx.user.id)` → un collaborateur est résolu vers l'**artisan parent**
→ **uniquement** les interventions du **tenant**. Pas de fuite cross-tenant.

### 🟡 Réserve LOW-MEDIUM — minimisation des données intra-tenant

L'endpoint renvoie **toutes** les interventions du jour du tenant (`:4535-4539`),
**enrichies du client** (nom, téléphone, **adresse** — `:4543`), à **tout** utilisateur
authentifié, **y compris un `technicien`** (rôle qui a `interventions.voir`). Aucun filtre
« interventions **assignées** au technicien ».

→ Sur un plan **entreprise** (jusqu'à 10 users), un technicien voit le **planning complet**
de l'entreprise + la **PII de tous les clients** (pas seulement ses missions). Principe de
**minimisation** (RGPD) non appliqué au sein du tenant.

- **Acceptable** pour un petit artisan (1-3 personnes, planning partagé = usage normal).
- **Discutable** à l'échelle (data-min : le technicien ne devrait voir que **ses**
  interventions). Pas une faille (intra-tenant, même entreprise) → **LOW-MEDIUM**, sous le
  seuil BLOCKER/HIGH.

Reco (si souhaité) : filtrer par `technicienId = currentTechnicien` pour le rôle
`technicien`, vue complète réservée à l'owner/secrétaire.

---

## Verdict

`getTodayInterventions` est **tenant-scopé** (pas d'IDOR) mais expose **toutes** les
interventions + PII clients du tenant à chaque collaborateur → **minimisation intra-tenant
LOW-MEDIUM** (acceptable petite équipe, à scoper par technicien sur les plans multi-users).
**Pas de nouvelle issue Linear.**

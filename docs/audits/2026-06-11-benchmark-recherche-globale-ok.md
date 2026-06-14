# Benchmark — Recherche globale (`search.global`) vs Odoo (recherche / command palette) : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `searchRouter.global` (`server/routers.ts:8465`) +
> `client/src/components/GlobalSearch.tsx` ↔ recherche transversale Odoo
> (search view / barre de commande).

---

## Conclusion : recherche globale **au niveau MVP**. Rien à proposer ; le reste est de l'ERP. Aucun ticket.

### ✅ Couverture suffisante et bien construite

| Aspect | Operioz | État |
| -- | -- | -- |
| Entités couvertes | **clients, devis, factures, interventions, fournisseurs** (5 requêtes parallèles) | ✅ cœur métier |
| Cloisonnement | **`WHERE artisanId = ?`** sur chaque requête (cf. audit `raw-sql-pool-execute-tenant-scoping-ok`) | ✅ pas de fuite tenant |
| Robustesse saisie | `query` borné `z.string().min(1).max(100)` | ✅ |
| UX recherche | `COLLATE utf8mb4_general_ci` (**insensible accents + casse** : « evi » trouve « Évrard »), `LIMIT 5` par entité | ✅ |
| Injection | requêtes **paramétrées** (LIKE en `?`) | ✅ pas de SQLi |
| Front | composant `GlobalSearch.tsx` intégré au `DashboardLayout` | ✅ |

→ Un artisan trouve rapidement un client/devis/facture/intervention/fournisseur depuis
une **barre unique**, résultats **cloisonnés** et titrés. C'est le besoin réel d'un MVP.

### Écarts restants = ERP / over-engineering (hors MVP)

- **Filtres sauvegardés**, **recherche par domaine personnalisé**, **groupements**,
  recherche full-text avancée (pertinence/stemming), **command palette** d'actions :
  fonctionnalités **ERP/power-user** d'Odoo — sur-ingénierie pour un artisan.
- Élargir à d'autres entités (articles, chantiers, dépenses) serait un **plus mineur**,
  non bloquant — à faire au fil de l'eau si besoin utilisateur, pas un ticket prioritaire.

---

## Verdict

La **recherche globale** est **au niveau MVP** : 5 entités cœur, **cloisonnée par tenant**,
insensible aux accents/casse, bornée et paramétrée, avec une UI dédiée. Les écarts restants
(filtres sauvegardés, domaines custom, groupements, command palette) relèvent de l'**ERP
power-user**, hors périmètre artisan. **Aucun nouveau ticket benchmark.**

---

### Note de fin de rotation (méta)

Avec cette note, **les 13 domaines de la rotation + plusieurs adjacents** (catalogue,
trésorerie, mobilité, recherche) ont été comparés à Odoo 19. État : **~22 tickets d'écart à
valeur** (OPE-141→162) et **10 notes `-ok`** de parité (cf. `benchmark-synthese-couverture`).
Les pistes restantes sont soit **niche/hors-MVP** (Chorus Pro B2G, e-reporting 2026, retenue
de garantie — Odoo OSS ne les outille pas non plus), soit des **raffinements mineurs**. Les
prochains firings privilégieront des **notes `-ok`** ou de **vrais** écarts neufs, pour
**éviter le sur-ticketing**.

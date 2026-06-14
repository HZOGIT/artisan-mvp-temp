# Audit — `devisIA.genererDepuisDevisIA` : ownership, rate-limit, output advisory — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `genererDepuisDevisIA` (`routers.ts:3304-3333+`) — génération IA de
> suggestions de commande fournisseur depuis un devis accepté.

---

## Conclusion : endpoint IA bien gardé. Pas de BLOCKER/HIGH.

Enjeux : IDOR (devis d'un autre tenant), **burn IA** (cost-DoS), **hallucination IA**
(quantité/prix aberrants auto-commités en commande).

### Garde-fous présents

1. **Rate-limit IA** : `checkRateLimit(artisan.id)` → `TOO_MANY_REQUESTS` (`:3309`).
   *(Contrôle de coût présent — contrairement à `analyserPhotos` signalé manquant en
   commentaire d'OPE-24.)*
2. **Ownership** : `devis.artisanId !== artisan.id → NOT_FOUND` (`:3314`).
3. **Garde de statut** : `devis.statut !== "accepte" → BAD_REQUEST` (`:3317`).

### Sortie IA = **advisory** (user-in-the-loop), pas d'auto-commit

`genererDepuisDevisIA` **retourne** des `lignes` suggérées (`return { lignes, notes }`,
`:3323`) — il **ne crée pas** de commande fournisseur. La création réelle est une étape
**séparée** (`commandesFournisseurs.create`, déclenchée par l'utilisateur avec les lignes
**revues**). → une **hallucination** de quantité/prix par l'IA apparaît dans les
**suggestions**, **revue avant** tout engagement → pas de commande aberrante auto-générée.

L'ajustement quantitatif s'appuie sur le **stock du tenant**
(`getStocksByArtisanId(artisan.id)`, `:3328`) — scopé.

---

## Verdict

`genererDepuisDevisIA` : **ownership** du devis, **rate-limité** (coût IA), **garde de
statut**, et **sortie advisory** (l'utilisateur revoit les suggestions avant de créer la
commande) → pas d'IDOR, pas de burn non borné, pas d'auto-commit d'une hallucination. Pas
de nouvelle issue Linear. *(L'IDOR sur les autres procédures `devisIA` — getById/addPhoto/
analyserPhotos — reste **déjà filé**.)*

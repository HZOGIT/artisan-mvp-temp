# Audit — Commandes fournisseurs : IDOR par FK non validée (→ OPE-47, variante)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `commandesFournisseursRouter` (`routers.ts:3263-3460+`), `fournisseursRouter`
> (`:3030`), `getFournisseurById` (non scopé). Aussi vérifié : config CORS.

---

## CORS — RAS

Aucun package `cors`, aucun en-tête `Access-Control-Allow-Origin` (`grep` → 0). →
politique **same-origin par défaut** (SPA + API servis par le même Express). Pas de
CORS permissive avec credentials. **Sûr.**

## Commandes fournisseurs — vecteur principal sain, mais fuite via FK

`getById`/`update`/`updateStatut`/`delete`/`genererDepuisDevisIA` vérifient bien
`commande.artisanId === artisan.id` (ou l'ownership du devis) → **pas d'IDOR direct**
sur la commande. `fournisseursRouter.getById` (`:3038`) est lui aussi **correctement
scopé** (`fournisseur.artisanId !== artisan.id → null`).

### 🟠 HIGH — IDOR par **FK non validée** (confused deputy) → rattaché à **OPE-47**

Mécanisme **distinct** du pattern « `async ({ input })` sans ctx » d'OPE-47 : la route
**a** `ctx` et vérifie l'ownership de la commande, mais fuite via une clé étrangère :

1. `create` (`:3440`) accepte `fournisseurId` (`:3442`) → passé à
   `createCommandeFournisseur` **sans** vérifier `fournisseur.artisanId === artisan.id`.
   Un attaquant crée dans **son** tenant une commande pointant vers le `fournisseurId`
   d'un **autre** tenant.
2. `getById` (`:3424`) — après le check commande (✅) — résout
   `getFournisseurById(commande.fournisseurId)` **non scopé** et renvoie l'objet
   complet (`{ ...commande, lignes, fournisseur }`, `:3436-3437`).

→ **Lecture cross-tenant du fournisseur complet d'autrui** (nom, contact, email,
téléphone, adresse) en itérant `fournisseurId`. `list` fuite aussi le `fournisseurNom`.

**Implication remédiation** : `assertOwner` par route ne suffit pas ; il faut **scoper
`getXById` par `artisanId`** (reco #2 d'OPE-47) **et valider les FK d'entrée**
(`fournisseurId`/`clientId`/`stockId`/`articleId`/`technicienId`) avant insertion. →
**OPE-47 étendu par commentaire** (variante du pattern systémique). Pas de doublon.

---

## Réserves mineures

- `create`/`update` ne valident pas non plus `articleId`/`stockId` des lignes (même
  classe FK).
- Pas d'endpoint « réception » qui incrémente le stock à la livraison (`updateStatut`
  ne touche pas au stock) → complétude fonctionnelle, non bloquant.

---

## Verdict

Commandes fournisseurs : vecteur IDOR **direct** sain (commande + fournisseur scopés),
mais **fuite cross-tenant du fournisseur via FK non validée** (`create` → `getById`) —
variante du pattern systémique d'**OPE-47**, rattachée par commentaire (renforce la
nécessité de scoper `getXById` + valider les FK). CORS sûr. **Pas de nouvelle issue.**

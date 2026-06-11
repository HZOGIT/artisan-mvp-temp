# Audit — Module avis (reviews) : cloisonné, soumission token-gated. OPE-41 connu.

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `avisRouter` (`routers.ts:5050-5290`) — `getAll`/`list`/`getStats`,
> `envoyerDemande`, `repondre`, `moderer`, `submitAvis` ; `getPublishedAvisByArtisanId`
> (`db.ts`) ; rendu vitrine (`Vitrine.tsx`/`Avis.tsx`).

---

## Conclusion : pas d'IDOR, soumission token-gated robuste. Aucun NOUVEAU BLOCKER/HIGH. La modération (masquer négatifs) = OPE-41 (existant).

### ✅ Cloisonnement / lectures scopées

`getAll`/`list`/`getStats` → `getAvisByArtisanId(artisan.id)` / `getAvisStats(artisan.id)`
(scopé tenant). `envoyerDemande` vérifie `intervention.artisanId !== artisan.id` →
`NOT_FOUND`. Token de demande = `crypto.randomUUID()` (122 bits), expiry 14 j.

### ✅ Modération scopée (pas d'IDOR)

`repondre` (`:5203`) et `moderer` (`:5221`) chargent `getAvisById(input.avisId)` puis
vérifient **`avis.artisanId !== artisan.id`** → `NOT_FOUND`. Un artisan ne peut
répondre/modérer que **ses** avis.

### ✅ `submitAvis` (public) robuste

`submitAvis` (`:5241`, `publicProcedure`) :
- **Token-gated** : `getDemandeAvisByToken(input.token)` → `NOT_FOUND` sinon.
- **Usage unique** : `demande.statut === 'completee'` → `BAD_REQUEST`.
- **Expiry appliqué** : `new Date() > demande.expiresAt` → `BAD_REQUEST`.
- **Scopé / pas d'IDOR** : l'avis est créé avec `artisanId`/`clientId`/`interventionId`
  **issus de la demande** (token), **pas** d'input → impossible d'injecter un avis sur un
  autre tenant. `note` = `z.number().min(1).max(5)`.
- **Pas de XSS** : `commentaire` rendu via React (`{a.commentaire}` dans `Vitrine.tsx:517`
  / `Avis.tsx:168`) → **auto-échappé**.

### 🟡 Connu — déjà filé

**Modération = masquage des avis négatifs** : `moderer` permet `statut: "masque"`, et
`getPublishedAvisByArtisanId` / stats publiques ne renvoient que `statut = 'publie'`
(`db.ts`). Un artisan peut donc **masquer des avis négatifs authentiques** → note publique
**gonflée**. = **OPE-41** (existant, intégrité/produit). Pas de doublon.

### 🟢 Observations LOW (sous le seuil, pas d'issue)

1. **`submitAvis.commentaire` non borné** : `z.string().optional()` **sans `.max()`** sur un
   endpoint **public** → payload volumineux stocké (DoS/stockage). Pas de XSS (rendu React).
   **Candidat auto-fix safe** : `.max(5000)` (cohérent avec les autres bornes publiques
   posées). 
2. **Footer email non échappé** : `${artisan.nomEntreprise}` dans le body de `envoyerDemande`
   (`:5134`) reste brut (le greeting `:5129` est `safeHtml`). Donnée premier-party (artisan) →
   risque faible ; à aligner sur `safeHtml` par cohérence.

---

## Verdict

Le module avis est **correctement cloisonné** (lectures/modération scopées par `artisanId`)
et la **soumission publique est robuste** (token-gated, usage unique, expiry, ids
server-derived, rendu React échappé). **Pas d'IDOR, pas de nouveau BLOCKER.** Le masquage des
avis négatifs (note gonflée) = **OPE-41** (existant). Deux points **LOW** (commentaire non
borné = candidat auto-fix ; footer email à échapper). **Pas de nouvelle issue Linear.**

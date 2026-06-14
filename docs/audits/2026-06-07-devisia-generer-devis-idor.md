# Audit — Génération de devis IA (`devisIA.genererDevis`) : IDOR analyse cross-tenant

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : génération de devis depuis l'analyse photos IA — `devisIA.genererDevis`
> (`routers.ts:6930`) → `creerDevisDepuisAnalyseIA` (`db.ts:5109`). Relève d'**OPE-30**
> (IDOR module analyse photos IA) : **4ᵉ route** non couverte, étendue par commentaire.

---

## 🔴 Relève d'OPE-30 (BLOCKER) — `genererDevis` matérialise l'analyse d'un autre tenant en devis

### Problème

`genererDevis` résout bien l'artisan appelant, mais transmet `analyseId` et
`clientId` **bruts** à `creerDevisDepuisAnalyseIA` :

```typescript
// routers.ts:6930 genererDevis — artisan vérifié, mais analyseId/clientId non vérifiés
const artisan = await db.getArtisanByUserId(ctx.user.id);
if (!artisan) throw NOT_FOUND;
return await db.creerDevisDepuisAnalyseIA({
  analyseId: input.analyseId,   // ← jamais vérifié comme appartenant à artisan
  clientId: input.clientId,     // ← jamais vérifié non plus
  artisanId: artisan.id,
});
```

et `creerDevisDepuisAnalyseIA` lit l'analyse **sans scope artisan** :

```typescript
// db.ts:5118 — aucune comparaison analyse.artisanId === params.artisanId
const analyse = await getAnalysePhotoById(params.analyseId);
if (!analyse) return null;
const resultats = await getResultatsAnalyse(params.analyseId);   // ← d'un autre tenant
// ... construit les lignes depuis s.nomArticle / s.quantiteSuggeree / s.prixEstime ...
await dbi.insert(devis).values({ artisanId: params.artisanId, clientId: params.clientId,
  objet: analyse.titre || "...", ... });                         // ← devis créé chez l'attaquant
```

### Exploitation

En itérant `analyseId = 1..N`, un artisan crée chez lui des devis remplis avec les
**suggestions/quantités/prix et le titre** de l'analyse photos **d'un autre
artisan** → exfiltration du contenu de diagnostic (nature des travaux, métrés,
prix estimés) de toute la plateforme, via une route d'**écriture**. C'est le
pendant « write/exfil » du `getById` déjà décrit dans OPE-30 (qui lit
`getDevisGenereByAnalyse`).

Secondairement, `clientId` n'est pas validé : le devis (créé sous l'`artisanId` de
l'attaquant) peut référencer un `clientId` arbitraire (incohérence de données,
impact faible car les autres lectures scopent par l'artisanId de l'attaquant).

### Pourquoi ce n'est pas un doublon distinct

Même module (`devisIARouter`), même cause racine (`getAnalysePhotoById` /
`getResultatsAnalyse` scopés par id seul) et **même fix** qu'OPE-30 : le helper
`assertAnalyseOwnership(analyseId, userId)` proposé dans OPE-30 couvre aussi
`genererDevis`. → **Ajouté à OPE-30** par commentaire (4ᵉ route), pas de nouvelle
issue.

### Fix

Dans `genererDevis`, avant l'appel :
`const { artisan } = await assertAnalyseOwnership(input.analyseId, ctx.user.id);`
+ valider `clientId` via `getClientByIdSecure(input.clientId, artisan.id)`.

---

## Notes mineures (déjà tracées)

- **`tauxTVA: 20` codé en dur** dans `creerDevisDepuisAnalyseIA` (`db.ts:5132`) et
  dans le prompt d'`assistant.generateDevis` (`routers.ts:7031`) → ignore les taux
  réduits bâtiment (10 %). Relève d'**OPE-58/OPE-21** (TVA). Pas de nouvelle entrée.
- **Prix IA potentiellement hallucinés** (`assistant.generateDevis` renvoie
  `prixUnitaireHT` libre, pas strictement issu du catalogue) → qualité de feature ;
  l'artisan révise le brouillon avant envoi. `assistant.generateDevis` est
  **rate-limité** (`checkRateLimit`, `routers.ts:7016`) — pas d'abus coût.

---

## Verdict

`devisIA.genererDevis` ajoute une **4ᵉ route IDOR** au module analyse photos IA
d'**OPE-30** (lecture/exfiltration cross-tenant d'analyses via création de devis).
Consolidé dans OPE-30. Pas de nouvelle issue.

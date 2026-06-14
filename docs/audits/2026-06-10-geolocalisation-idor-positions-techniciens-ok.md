# Audit — Géolocalisation : IDOR positions/historique techniciens — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `geolocalisationRouter` (`routers.ts:5271-5350`) — `updatePosition`,
> `getPositions`, `getLastPosition`, `getHistorique`, `getStatistiquesDeplacements`,
> `createHistoriqueDeplacement`, `getHistoriqueDeplacements` ; helper
> `assertTechnicienOwner` (`routers.ts:5262`).

---

## Conclusion : positions GPS cloisonnées tenant. Pas de BLOCKER/HIGH **nouveau**.

### Cross-tenant IDOR bloqué sur **chaque** procédure à `technicienId`

Le vecteur sensible : `technicienId` est un input numérique → énumérer les techniciens
d'un **autre tenant** pour lire/écrire leur **géolocalisation** (donnée perso CNIL). Tous
les endpoints concernés passent par :

```typescript
// routers.ts:5262
async function assertTechnicienOwner(technicienId, userId) {
  const artisan = await db.getArtisanByUserId(userId);          // tenant du caller
  const tech = artisan ? await db.getTechnicienById(technicienId) : null;
  if (!tech || !artisan || tech.artisanId !== artisan.id)        // appartenance
    throw new TRPCError({ code: "NOT_FOUND", … });
}
```

Appelé en tête de `updatePosition` (`:5285`), `getLastPosition` (`:5298`), `getHistorique`
(`:5309`), `createHistoriqueDeplacement` (`:5340`), `getHistoriqueDeplacements` (`:5347`).
→ un `technicienId` étranger = `NOT_FOUND` **avant** toute lecture/écriture GPS. Pas de
fuite ni d'altération cross-tenant.

Les endpoints sans `technicienId` (`getPositions`, `getStatistiquesDeplacements`) scopent
via `getArtisanByUserId(ctx.user.id)` → uniquement le tenant courant.

> C'est l'usage **correct** du pattern `assertTechnicienOwner` — à l'inverse de
> `notificationsPush` / `conges.byTechnicien` qui l'omettaient (IDOR déjà filé). Ici, OK.

---

## Réserves (non bloquantes)

1. **Intra-tenant LOW** : `assertTechnicienOwner` valide l'appartenance au **tenant**, pas
   l'identité de l'appelant = ce technicien. Donc un user du tenant peut poster une
   position pour **un collègue** (spoof GPS intra-entreprise). Sans impact cross-tenant ;
   durcissement = lier `updatePosition` à `ctx.user`↔technicien. **LOW**.
2. **Conformité CNIL / permission** : consentement, conservation illimitée, désactivation
   hors service, permission `geolocalisation` non appliquée → **déjà filés** (OPE-17 +
   issues CNIL géoloc). Pas de doublon.

---

## Verdict

Géolocalisation : **positions/historiques cloisonnés par tenant** via
`assertTechnicienOwner` (rejet du `technicienId` étranger) sur 100 % des endpoints
concernés. Résiduel = spoof **intra-tenant** (LOW) + conformité CNIL/permission **déjà
filée**. **Pas de nouvelle issue Linear.**

# Audit — Rapports personnalisés

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `rapportsRouter` (`routers.ts:5645`) — création/exécution de
> rapports personnalisés (ventes, clients, interventions, stocks, fournisseurs,
> financier) et `executerRapport` (`db.ts:2467`).

---

## Ce qui fonctionne correctement

- **Pas d'injection SQL** : `executerRapport` ne construit **aucune SQL
  dynamique** depuis l'input. Le `type` du rapport pilote un `switch` fixe vers
  des requêtes Drizzle paramétrées. ✓
- `list` / `create` sont scopés sur `getArtisanByUserId(ctx.user.id)`. ✓

---

## 🔴 BLOCKER — IDOR : `executer` renvoie les données d'un AUTRE artisan (fuite cross-tenant de factures / clients / CA)

### Problème

`rapports.executer` (`routers.ts:5709`) appelle `executerRapport(input.rapportId)`
**sans vérifier que le rapport appartient à l'appelant** (le handler ne
destructure même pas `ctx`). Or `executerRapport` charge le rapport par id
(non scopé) puis exécute la requête **scopée sur `rapport.artisanId` — le
propriétaire du rapport, c'est-à-dire la victime** :

```typescript
// db.ts:2470-2478
const rapport = await getRapportPersonnaliseById(rapportId);   // WHERE id = ? (non scopé)
switch (rapport.type) {
  case 'ventes':
    const facturesList = await db.select().from(factures)
      .where(eq(factures.artisanId, rapport.artisanId));        // ← artisanId de la VICTIME
    resultats = facturesList;                                   // ← renvoyé à l'appelant
  // clients / interventions / stocks / fournisseurs / financier : idem
}
```

`getRapportPersonnaliseById` ne filtre que par `id`
(`WHERE rapportsPersonnalises.id = ?`).

### Exploitation

Un artisan authentifié itère `rapportId = 1..N` sur `executer` et récupère, pour
chaque rapport d'un autre tenant :
- **`ventes`** → toutes les **factures** de la victime (numéros, montants, statut, client) ;
- **`clients`** → tout le **carnet clients** (nom, email, téléphone, adresse — PII) ;
- **`interventions`**, **`stocks`**, **`fournisseurs`** → idem ;
- **`financier`** → le **chiffre d'affaires** total de la victime (`totalCA`).

Fuite multi-tenant de données financières + PII, en lecture directe.

### Routes voisines du même routeur également non scopées

- **`historique`** (`:5718`) → `getHistoriqueExecutions(rapportId)` (par id) :
  renvoie les exécutions passées, dont le champ **`resultats`** = un **snapshot
  des données de la victime**. Fuite même sans ré-exécuter.
- **`delete`** (`:5696`) → `deleteRapportPersonnalise(id)` (par id, sans `ctx`) :
  **suppression cross-tenant** d'un rapport + son historique.
- **`toggleFavori`** (`:5703`) → toggle d'un rapport d'autrui.

### Fix proposé

Vérifier l'appartenance avant toute opération :

```typescript
executer: protectedProcedure
  .input(z.object({ rapportId: z.number(), parametres: z.record(z.string(), z.unknown()).optional() }))
  .query(async ({ ctx, input }) => {
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    const rapport = await db.getRapportPersonnaliseById(input.rapportId);
    if (!artisan || !rapport || rapport.artisanId !== artisan.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Rapport introuvable" });
    }
    return await db.executerRapport(input.rapportId, input.parametres);
  }),
```
(idem `historique` / `delete` / `toggleFavori` ; ou passer `artisanId` aux helpers
et filtrer le `WHERE`.)

### Estimation

~45 min — check d'ownership sur executer/historique/delete/toggleFavori + test
cross-tenant.

---

## Estimation totale

- BLOCKER (IDOR fuite cross-tenant rapports) : ~45 min

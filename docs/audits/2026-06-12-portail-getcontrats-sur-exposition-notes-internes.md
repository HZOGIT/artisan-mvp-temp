# Audit — Portail client : `getContrats` renvoie le contrat BRUT (notes internes) + argument `artisanId` manquant

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟡 MEDIUM**

> `clientPortal.getContrats` (`server/routers.ts:4290`) + `db.getContratsByClientId` (`server/db.ts`).
> Complète/affine `2026-06-11-portail-client-data-scoping-ok.md` (qui validait le **scoping
> clientId** mais pas l'**exposition au niveau champ**).

---

## Conclusion du sweep portail : scoping multi-tenant SAIN, 1 sur-exposition de champs.

### ✅ Scoping correct (vérifié)

Tous les endpoints publics du `clientPortalRouter` résolvent le client via le **token**
(`getClientPortalAccessByToken`) et requêtent par **`access.clientId`** — jamais un `clientId`
d'input (les endpoints `clientId`-en-input sont les routes **artisan** `protectedProcedure`
generateAccess/getStatus/deactivate). Pas d'IDOR, pas de fuite cross-client/cross-tenant
(`clientId` est globalement unique → pinne le tenant). `getDevis`/`getFactures`/`getInterventions`/
`getClientInfo` **mappent un sous-ensemble minimal** de champs client-safe. ✓

### 🟡 MEDIUM — `getContrats` : objet contrat BRUT renvoyé au client

```ts
// routers.ts:4290 — contrairement aux endpoints frères, AUCUN mapping de champs
getContrats: publicProcedure.input(z.object({ token: z.string() }))
  .query(async ({ input }) => {
    const access = await db.getClientPortalAccessByToken(input.token);
    if (!access) throw UNAUTHORIZED;
    return await db.getContratsByClientId(access.clientId); // ← objet complet
  })
```

`getContratsByClientId` fait `SELECT *` de `contrats_maintenance` → le portail renvoie **toutes**
les colonnes, dont **`notes` (text — notes INTERNES de l'artisan)** et `conditionsParticulieres`.
→ tout client disposant de son lien portail peut lire, dans la réponse API brute, les **notes
privées** que l'artisan a inscrites sur son contrat (ex. « client mauvais payeur, surveiller »).
Confidentialité / relation client. **Distinct d'OPE-67** (factures brouillon/annulée payables).

### 🟡 LOW (latent) — argument `artisanId` manquant

`db.getContratsByClientId(clientId, artisanId)` attend **2** paramètres, mais le routeur n'en passe
**qu'un** (`access.clientId`) → `artisanId = undefined` dans le `eq(contratsMaintenance.artisanId,
undefined)`. Bug latent (erreur tsc noyée dans la baseline ; esbuild ne type-check pas) : selon le
traitement drizzle de `undefined`, la requête peut **renvoyer 0 ligne** (portail contrats vide) ou
ignorer la condition. Pas une faille de sécurité (le `clientId` pinne déjà le tenant) mais fragile.

## Fix proposé (~10 min, behavior-preserving)

1. `getContrats` : **mapper un sous-ensemble client-safe** (id, reference, type, montantHT,
   periodicite, dateDebut, dateFin, prochainPassage, conditionsParticulieres) — **exclure `notes`**
   (interne), comme les endpoints frères.
2. Passer **`access.artisanId`** en 2ᵉ argument de `getContratsByClientId` (corrige le bug latent +
   défense en profondeur).

## Linear

Nouvelle issue **« Lancement 30 juin »** (MEDIUM). Distinct d'**OPE-67** (statut payable/brouillon
factures). Affine l'audit `2026-06-11-portail-client-data-scoping-ok.md` (scoping OK, exposition de
champs manquée).

# Audit — Interventions : FK-injection clientId / technicienId — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `interventions.create` (`routers.ts:1869`), `assignerTechnicien`
> (`routers.ts:1989`).

---

## Conclusion : FK d'entrée validées. Pas de BLOCKER/HIGH.

Vecteur cherché : créer/assigner une intervention en référençant le **client** ou le
**technicien d'un autre tenant** (confused deputy via FK d'entrée).

### `create` — `clientId` validé contre le tenant

```typescript
// routers.ts:1882
const client = await dbSecure.getClientByIdSecure(input.clientId, artisan.id);
if (!client) throw new TRPCError({ code: "NOT_FOUND", … });
```

→ Un `clientId` étranger = `NOT_FOUND` **avant** création. `createIntervention({ artisanId:
artisan.id, clientId, … })` scoped. Pas de `technicienId` à la création (assignation
séparée).

### `assignerTechnicien` — **les deux** FK validées

```typescript
// :2000  intervention.artisanId !== artisan.id  → FORBIDDEN
// :2004-2006 (commentaire « SECURITE : valider aussi que le technicien appartient … »)
const tech = await db.getTechnicienById(input.technicienId);
if (!tech || tech.artisanId !== artisan.id) throw FORBIDDEN;
```

→ Impossible d'assigner une intervention (du tenant) à un **technicien d'un autre tenant**,
ni d'agir sur une intervention étrangère. Double validation FK (pattern correct, identique
à `chantiers.associerIntervention`).

### Note dates

`create` prend `dateDebut`/`dateFin` **fournies par le client** (datetime choisi) →
`new Date(input.*)` = instant choisi (pas le `new Date()` serveur visé par OPE-83). OK.

---

## Verdict

Interventions : `clientId` validé via `getClientByIdSecure`, `technicienId` validé via
`getTechnicienById` + check `artisanId` (avec garde explicite). **Pas de FK-injection ni
d'IDOR.** **Pas de nouvelle issue Linear.**

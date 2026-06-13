# Audit — IDOR : `contrats.updateIntervention` modifie l'intervention d'un autre tenant

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : `contratsRouter` (`routers.ts:4267-4538`) + `updateInterventionContrat`
> (`db.ts:2997`).

---

## Conclusion : IDOR cross-tenant en écriture sur les interventions de contrat (HIGH). Le reste du router est correctement cloisonné.

### Le reste du `contratsRouter` est OK (cloisonné)

`getById` / `update` / `delete` / `generateFacture` / `getInterventions` /
`createIntervention` chargent le contrat par id puis vérifient
`contrat.artisanId !== artisan.id` → `FORBIDDEN`. `list` est scopé `artisanId`.
`create` (clientId non vérifié) = **OPE-25** ; `generateFacture` (idempotence) = **OPE-40**.

### 🟠 HIGH — `updateIntervention` : enfant découplé du parent vérifié

`routers.ts:4510-4537` :
```ts
updateIntervention: protectedProcedure
  .input(z.object({ id: z.number(), contratId: z.number(), titre, description,
                    dateIntervention, duree, technicienNom, statut, rapport, notes }))
  .mutation(async ({ ctx, input }) => {
    const contrat = await db.getContratById(input.contratId);      // <- parent
    if (!contrat) throw NOT_FOUND;
    const artisan = await db.getArtisanByUserId(ctx.user.id);
    if (!artisan || contrat.artisanId !== artisan.id) throw FORBIDDEN;  // <- vérifie le PARENT
    const { id, contratId, ...updateData } = input;
    return db.updateInterventionContrat(id, { ... });              // <- met à jour l'ENFANT par `id`
  })
```

Le contrôle d'ownership porte sur **`input.contratId`** (le parent), mais la mise à jour
porte sur **`input.id`** (l'intervention) — **deux entrées indépendantes**. Aucune
vérification que l'intervention `input.id` appartient bien à `input.contratId` (ni à
l'artisan). Côté DB, `db.ts:2997` :
```ts
export async function updateInterventionContrat(id, data) {
  await db.update(interventionsContrat).set({ ...data }).where(eq(interventionsContrat.id, id));
  // ^ scope = id SEUL, aucun artisanId/contratId
}
```

**Exploitation (cross-tenant write)** :
1. L'attaquant (artisan A) crée son propre contrat → `contratId = CA` (lui appartient).
2. Il appelle `contrats.updateIntervention({ id: <id intervention victime B>, contratId: CA,
   statut: "annulee", rapport: "...", titre: "..." , ... })`.
3. Le check passe (A possède `CA`).
4. `updateInterventionContrat(idVictime, data)` **écrase l'intervention de B**.

Les `interventionsContrat.id` sont des entiers séquentiels → **énumérables** → un tenant
peut modifier (titre, description, date, statut, rapport, notes) les interventions de
contrat de **n'importe quel autre tenant**. Altération de données RH/planning cross-tenant.

### Classe identique, ressource distincte

Même pattern « vérifie le parent mais pas que l'enfant appartient au parent » que **OPE-9**
(lignes de devis) / **OPE-10** (options de devis), ici sur les **interventions de contrat**.
**Distinct d'OPE-17** (gating de permissions = collaborateur **même tenant**) : ici la
faille est **cross-tenant** et persiste même avec un gating de rôle correct.

---

## Fix proposé

Charger l'intervention et vérifier son appartenance avant l'update (comme le pattern
existant ailleurs) :
```ts
const intervention = await db.getInterventionContratById(input.id);
if (!intervention || intervention.contratId !== input.contratId) {
  throw new TRPCError({ code: "NOT_FOUND", message: "Intervention non trouvée" });
}
// (contrat déjà vérifié appartenir à l'artisan ci-dessus)
```
ou, plus robuste, scoper l'UPDATE en base par `artisanId` :
`updateInterventionContrat(id, data, artisanId)` →
`.where(and(eq(interventionsContrat.id, id), eq(interventionsContrat.artisanId, artisanId)))`
(la table porte `artisanId`, renseigné à la création — `routers.ts:4499`).

---

## Verdict

`contrats.updateIntervention` permet une **écriture cross-tenant** sur les interventions de
contrat (enfant `input.id` découplé du parent `input.contratId` vérifié) → **HIGH**.
Non couvert par les issues existantes (OPE-9/10 = devis ; OPE-25/40 = contrats create/facture ;
OPE-17 = permissions same-tenant). **→ Nouvelle issue Linear créée.**

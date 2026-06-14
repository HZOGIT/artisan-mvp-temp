# Audit — devisOptions : IDOR sur tout le routeur (extension d'OPE-10)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `devisOptionsRouter` (`routers.ts:5492`). **Pas de nouvelle issue**
> (couvert par OPE-10 — lignes — et OPE-47 — systémique) ; OPE-10 **étendue par
> commentaire** pour couvrir tout le routeur.

---

## Constat — l'IDOR ne se limite pas aux lignes (OPE-10) : tout le routeur est non scopé

OPE-10 ne nommait que `updateLigne` / `deleteLigne`. En réalité **toutes** les
mutations de `devisOptionsRouter` sont des handlers `async ({ input })` **sans
`ctx`** et appellent directement les helpers `db.*` (qui ne scopent que par id) :

```typescript
// routers.ts:5505-5548 — aucun ctx, aucune vérif d'appartenance
create:          db.createDevisOption(input)              // option sur n'importe quel devisId
update:          db.updateDevisOption(id, data)
delete:          db.deleteDevisOption(input.id)
select:          db.selectDevisOption(input.optionId)
convertirEnDevis: db.convertirOptionEnDevis(input.optionId)  // ← WRITE cross-tenant
createLigne:     db.createLigneDevisOption(...)
// updateLigne / deleteLigne : déjà dans OPE-10
```

### Le plus grave — `convertirEnDevis` (`:5543`)

`convertirOptionEnDevis(optionId)` **remplace les lignes du devis** par celles de
l'option choisie. Sans contrôle d'appartenance, un artisan peut, en devinant un
`optionId`, **écraser le contenu (lignes/totaux) du devis d'un autre artisan**.
Écriture cross-tenant destructive, au-delà de la simple lecture/modification de
lignes d'OPE-10.

### Exploitation

Itérer `optionId` / `id` / `devisId = 1..N` → créer/modifier/supprimer des options
et **convertir** (donc réécrire) les devis d'autres artisans.

---

## Action

- **Pas de nouvelle issue Linear** (anti-doublon : OPE-10 + OPE-47 couvrent ce
  sujet).
- **OPE-10 étendue** via commentaire : son correctif doit scoper **tout le
  routeur** `devisOptions` (résoudre `devis.artisanId === artisan.id` via
  `option.devisId` pour chaque route), pas seulement `updateLigne`/`deleteLigne`.
- S'inscrit dans la remédiation systémique **OPE-47** (généraliser une garde
  d'ownership ; cf. `assertChantierOwner` comme modèle).

---

## Fix proposé (pour OPE-10)

Helper d'appartenance, branché sur chaque route :

```typescript
async function assertOptionOwner(optionId: number, userId: number) {
  const option = await db.getDevisOptionById(optionId);
  const devis = option ? await db.getDevisById(option.devisId) : null;
  const artisan = await db.getArtisanByUserId(userId);
  if (!artisan || !devis || devis.artisanId !== artisan.id)
    throw new TRPCError({ code: "NOT_FOUND" });
}
// + pour `create`/`getByDevisId` : vérifier l'ownership de `input.devisId`.
```

### Estimation

~1 h (en plus d'OPE-10) — garde sur create/update/delete/select/convertirEnDevis/
createLigne + test cross-tenant.

# Audit — `createFactureFromDevis` : lookup de la facture par `numero` SANS `artisanId` → corruption/fuite cross-tenant

**Date** : 2026-06-12 · **Sévérité** : 🔴 **BLOCKER** · **Projet** : Lancement 30 juin
**Domaine** : Devis→Facture (conversion) · trouvé pendant une passe de QA benchmark.

---

## Résumé

À la conversion d'un devis en facture, `createFactureFromDevis` (`server/db.ts:633`) **insère**
la facture puis la **relit par `numero` seul**, **sans scoper sur `artisanId`** :

```ts
// server/db.ts:642  insert facture (A)
await db.insert(factures).values({ artisanId: devisData.artisanId, …, numero });
// server/db.ts:655-657  RELECTURE NON SCOPÉE
const factureResult = await db.select().from(factures)
  .where(eq(factures.numero, numero))   // ❌ pas de eq(factures.artisanId, …)
  .limit(1);
const facture = factureResult[0];
// server/db.ts:661-676  les lignes du devis sont rattachées à facture.id
```

Or **la numérotation est par artisan** (`getNextFactureNumber`, `db.ts` : préfixe
`prefixeFacture || 'FAC'` + compteur **par artisan**) → tous les artisans ont
`FAC-00001`, `FAC-00002`, … **et `factures.numero` n'a AUCUNE contrainte UNIQUE**
(`schema.ts:138`, cf. [[OPE-34]]). Donc `WHERE numero='FAC-00001' LIMIT 1` (sans `ORDER BY`)
peut renvoyer la facture **d'un AUTRE artisan** (typiquement la plus ancienne / plus petit `id`).

## Conséquences (corruption + fuite, non déterministes)

Quand l'artisan A convertit son devis et que le `numero` collisionne avec une facture
existante de l'artisan B :

1. **Les lignes du devis de A sont insérées sur la facture de B** (`factureId = facture(B).id`,
   `:663`) → la facture **légale** de B est corrompue (lignes étrangères, total stocké ≠ lignes,
   données commerciales de A injectées chez B).
2. La fonction **retourne la facture de B** → l'UI de A affiche le **numéro/client/montants de B**
   (**fuite cross-tenant** de données financières/PII).
3. La vraie facture de A reste **orpheline** (créée mais sans lignes).

Pas besoin d'attaquant : ça se produit en **fonctionnement multi-tenant normal** dès que deux
artisans partagent un `numero` (le cas par défaut, préfixe `FAC`). Le résultat dépend du plan
d'exécution MySQL → **corruption intermittente et silencieuse de documents légaux**.

## Preuve

- `server/db.ts:655-657` — `select … where(eq(factures.numero, numero)).limit(1)` (non scopé).
- Contraste : `createFacture` (`db.ts:627-629`) relit, lui, avec `and(eq(artisanId), eq(numero))` (**correct**). Seul `createFactureFromDevis` a l'oubli.
- `getNextFactureNumber` : numérotation **par artisan** (compteur `compteurFacture` + `MAX(numero)` scopé artisan) → collisions inter-artisans normales.
- `factures.numero varchar(50) NOT NULL` **sans `.unique()`** (`schema.ts:138`).
- Appelé par `devis.convertToFacture` (`routers.ts:797`) — chemin courant.

## Fix proposé (safe, behavior-preserving)

Scoper la relecture sur l'artisan, comme `createFacture` :

```ts
const factureResult = await db.select().from(factures)
  .where(and(eq(factures.artisanId, devisData.artisanId), eq(factures.numero, numero)))
  .orderBy(desc(factures.id))   // ceinture+bretelles : la plus récente = celle qu'on vient d'insérer
  .limit(1);
```

Mieux encore : récupérer la ligne via l'`insertId` de l'insert (évite toute relecture par
numéro). **Aucun changement de comportement** pour le cas mono-tenant ; corrige le cas
multi-tenant. Idéalement à faire **dans une transaction** (cf. [[OPE-84]]) avec une **contrainte
UNIQUE `(artisanId, numero)`** (cf. [[OPE-34]]) en défense de fond.

## Anti-doublon

- **OPE-68** = `convertToFacture` **idempotence** (re-conversion → N factures). Ici, défaut **distinct** sur **une seule** conversion : relecture cross-tenant.
- **OPE-34** = numérotation non atomique + pas de contrainte UNIQUE (cause racine partagée), mais ne décrit pas ce **lookup non scopé**.
- **OPE-84** = absence de transaction (le multi-insert n'est pas atomique) — complémentaire.
- IDOR clos (OPE-45/31/46) = accès cross-tenant **pilotés par un id d'entrée attaquant** ; ici c'est une **corruption auto-infligée** en fonctionnement normal. Distinct.

## Verdict

`createFactureFromDevis` relit la facture par `numero` **sans `artisanId`** → en multi-tenant
(numérotation par artisan, pas de contrainte UNIQUE), la conversion peut **rattacher les lignes
à la facture d'un autre artisan et renvoyer cette dernière** : **corruption + fuite cross-tenant
de documents légaux**, silencieuse et intermittente. **BLOCKER lancement.** Fix : scoper la
relecture par `artisanId` (1 ligne), idéalement via `insertId` + transaction + UNIQUE
`(artisanId, numero)`.

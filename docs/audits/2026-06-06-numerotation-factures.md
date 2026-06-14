# Audit — Numérotation des factures / devis

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : génération des numéros de factures, avoirs et devis. Exigence
> légale : numérotation **séquentielle, continue, sans trou et unique**
> (CGI art. 242 nonies A / BOI-TVA-DECLA-30-20-20).

---

## Ce qui fonctionne correctement

- Suppression de facture **bloquée** sauf `brouillon` : un document fiscal validé
  ne peut être supprimé, un avoir est exigé (`routers.ts:1380` — guard explicite). ✓
- Format des numéros préfixé + séquence zero-paddée (`FAC-00001`). ✓
- Audit log à la suppression de brouillon. ✓

---

## 🔴 BLOCKER — Numérotation non atomique + aucune contrainte UNIQUE → numéros de facture dupliqués

### Problème

`getNextFactureNumber` (`server/db.ts:589`) alloue le numéro en **lecture-puis-
écriture non atomique**, sans transaction ni verrou :

```typescript
// db.ts:589-612 (résumé)
const compteurParam = (params[0]?.compteurFacture || 0) + 1;
const maxResult = await db.select({ maxNum: sql`MAX(numero)` }).from(factures)
  .where(eq(factures.artisanId, artisanId));      // lit le MAX
// ...calcule compteur = max(compteurParam, maxFromDb)...
await db.update(parametresArtisan).set({ compteurFacture: compteur })...; // écrit
return `${prefix}-${String(compteur).padStart(5, '0')}`;
```

Puis `createFacture` (`db.ts:615`) **insère la facture après** que le numéro a été
retourné. Deux créations concurrentes :

1. Requête A lit `MAX = FAC-00010` → alloue `FAC-00011`.
2. Requête B lit `MAX = FAC-00010` (la facture de A n'est pas encore insérée)
   → alloue **aussi** `FAC-00011`.
3. Les deux insèrent une facture `FAC-00011`.

**Aucune protection au niveau base** : la table `factures` n'a **pas** de
contrainte/index UNIQUE sur `numero` (ni `UNIQUE(artisanId, numero)`) — vérifié
dans `drizzle/schema.ts` (le champ est `varchar(...).notNull()` sans `.unique()`,
aucun `uniqueIndex`). Le doublon est donc **inséré silencieusement**.

### Preuve que le problème est réel

Le code contient une routine **`fixDuplicateNumbers`** (`db.ts:2177`) dont la
boucle « Fix duplicate facture numbers per artisan » (`db.ts:2196`) détecte les
numéros en double et les **réécrit** :

```typescript
// db.ts:2202-2205
if (seenFactures.has(key)) {
  const newNumero = await getNextFactureNumber(f.artisanId);
  await db.update(factures).set({ numero: newNumero }).where(eq(factures.id, f.id));
}
```

L'existence même de ce correctif montre que des doublons **ont été observés**.
Pire : **réécrire le numéro d'une facture déjà émise est illégal** (immuabilité
du document fiscal). (La fonction n'a aujourd'hui pas de site d'appel, mais elle
ne doit jamais être exécutée telle quelle.)

### Impact

- **Non-conformité CGI art. 242 nonies A** : deux factures avec le même numéro,
  ou (si l'on ajoute une contrainte UNIQUE sans corriger la concurrence) des
  **échecs aléatoires de création de facture** (ER_DUP_ENTRY → 500) sous charge.
- `getNextDevisNumber` (`db.ts`) a **exactement le même pattern** (devis moins
  sensibles légalement, mais même bug de doublon).

### Fix proposé

1. **Allocation atomique** du compteur, p.ex. compteur atomique MySQL :
   ```sql
   UPDATE parametres_artisan
     SET compteurFacture = LAST_INSERT_ID(compteurFacture + 1)
     WHERE artisanId = ?;
   SELECT LAST_INSERT_ID();   -- numéro réservé, sans course
   ```
   (ou une transaction `SELECT ... FOR UPDATE` sur la ligne `parametres_artisan`).
2. **Contrainte DB** : `UNIQUE(artisanId, numero)` sur `factures` (et `devis`)
   comme filet de sécurité.
3. **Ne jamais réécrire** un numéro de facture émise : neutraliser
   `fixDuplicateNumbers`; corriger d'éventuels doublons existants via avoir.

### Estimation

~3 h — allocation atomique + migration contrainte UNIQUE + neutralisation du
renumber + test de concurrence.

---

## 🟠 HIGH — Numéro attribué dès le brouillon → trous de séquence à la suppression

Le numéro est alloué et le compteur incrémenté **à la création** (`createFacture`
→ `getNextFactureNumber`), donc dès l'état `brouillon`. La suppression de brouillon
étant autorisée (et correcte par ailleurs), le numéro consommé **laisse un trou**
dans la séquence (`FAC-00011` supprimé → la suite reprend à `FAC-00012`).

La numérotation des factures doit être **continue sans rupture** ; l'usage attendu
est d'attribuer le **numéro définitif à la validation**, pas à la création du
brouillon.

### Fix proposé

Attribuer un identifiant provisoire au brouillon et n'allouer le numéro
séquentiel définitif **qu'au passage en `validee`/`envoyee`**.

### Estimation

~0,5 j — déplacer l'allocation du numéro à la validation.

---

## Estimation totale

- BLOCKER (concurrence + UNIQUE + renumber illégal) : ~3 h
- HIGH (numéro au brouillon → trous) : ~0,5 j

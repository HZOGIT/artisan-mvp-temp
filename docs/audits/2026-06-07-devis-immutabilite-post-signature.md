# Audit — Immutabilité du devis après signature/acceptation

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : mutations d'édition du `devisRouter` (`routers.ts:646-790`) vs
> l'état signé/accepté. Distinct d'OPE-9/10 (IDOR lignes devis) et d'OPE-14/15/22/23
> (mécanisme de signature contournable).

---

## Ce qui fonctionne correctement

- **Ownership** : `update`/`delete`/`addLigne`/`updateLigne`/`deleteLigne`
  vérifient tous l'appartenance du devis à l'artisan. ✓
- Montants de ligne recalculés serveur + `recalculateDevisTotals`. ✓
- Côté **factures**, l'édition est bien bloquée hors `brouillon`
  (`routers.ts:1425` : « Document fiscal verrouillé »). ✓

---

## 🟠 HIGH — Un devis signé/accepté reste modifiable (et supprimable) : la signature ne protège pas le document

### Problème

Le `statut` du devis (`brouillon | envoye | accepte | refuse | expire`) passe à
**`accepte`** quand le client signe (flux `signature.signDevis`, qui crée aussi un
enregistrement `signaturesDevis`). Mais **aucune** mutation d'édition ne vérifie
le statut ni l'existence d'une signature :

```typescript
// routers.ts:691 addLigne / 736 updateLigne / 783 deleteLigne
const devisOwned = await db.getDevisById(input.devisId);
if (!devisOwned || devisOwned.artisanId !== artisan.id) throw NOT_FOUND;
// ← aucun check statut/signature : on modifie même un devis 'accepte'
... createLigneDevis / updateLigneDevis / deleteLigneDevis ...
await db.recalculateDevisTotals(devisId);   // recalcule les totaux du devis SIGNÉ
```

`update` (`:646`) et `delete` (`:674`) n'ont pas non plus de garde de statut → un
devis **signé** peut être édité (objet, statut) ou **supprimé** (avec son
enregistrement de signature).

Contraste : les **factures** bloquent toute édition hors `brouillon` ; les **devis**
n'ont aucune garde équivalente.

### Impact (intégrité de la signature électronique)

Scénario « signer bas, facturer haut » :
1. Le client **signe** un devis à 1 000 € (statut `accepte`, signature SMS
   horodatée, PDF signé reflétant 1 000 €).
2. L'artisan appelle `addLigne` / `updateLigne` → totaux recalculés à 2 000 €, le
   devis reste `accepte` **avec la même signature**.
3. Tout PDF régénéré (`generateDevisPDF`) affiche désormais **2 000 € sous une
   signature donnée pour 1 000 €**.
4. `createFactureFromDevis` copie les totaux/​lignes **courants** → le client est
   **facturé 2 000 €** pour un devis signé à 1 000 €.

La signature électronique perd toute valeur probante : le document signé n'est pas
immuable. C'est exploitable contre le client (fraude) et rend la fonctionnalité
« devis signé » juridiquement vide.

### Fix proposé

Verrouiller le devis dès qu'il est **accepté/signé** (statut `accepte` ou
présence d'une `signaturesDevis`) :

```typescript
async function assertDevisEditable(devisId: number) {
  const d = await db.getDevisById(devisId);
  const sig = await db.getSignatureByDevisId(devisId); // ou statut === 'accepte'
  if (!d || d.statut === 'accepte' || sig) {
    throw new TRPCError({ code: "FORBIDDEN",
      message: "Devis signé/accepté : créez une nouvelle version pour le modifier." });
  }
}
```
- À appeler dans `addLigne`/`updateLigne`/`deleteLigne` et bloquer les changements
  de contenu dans `update` ; interdire `delete` d'un devis signé.
- Pour réviser un devis signé : générer une **nouvelle version** (nouveau devis),
  pas muter l'original.

### Estimation

~1 h — garde d'éditabilité sur les 5 mutations + test (signer puis tenter une
modification).

---

## Estimation totale

- HIGH (immutabilité devis post-signature) : ~1 h

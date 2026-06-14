# Benchmark/QA — Devis à options/variantes : sélection client depuis le portail — ✅ CORRECT. Aucun ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA de correctness, feature récente OPE-146)

> Vérification de la feature **sélection d'une option de devis par le client** (`selectDevisOption`,
> déployée récemment, In Review OPE-146) ↔ Odoo `sale_management` (`sale.order.option`). Enjeux :
> invariant « **une seule** option sélectionnée par devis », **scoping** (pas de sélection cross-devis),
> garde anti-rejeu/expiration, throttle.

---

## Conclusion : la sélection d'option est **correcte et bien gardée**. Au niveau Odoo pour le périmètre MVP.

### ✅ Invariant « une seule option sélectionnée par devis »

`selectDevisOption` (`server/db.ts:5454`) **reset d'abord** toutes les options du devis à `selectionnee=false`, **puis** met la choisie à `selectionnee=true` + `dateSelection` :

```ts
await dbi.update(devisOptions).set({ selectionnee: false }).where(eq(devisOptions.devisId, opt.devisId));
await dbi.update(devisOptions).set({ selectionnee: true, dateSelection: new Date() }).where(eq(devisOptions.id, optionId));
```

→ pas d'**ambiguïté** (deux variantes « Standard » et « Premium » ne peuvent pas être `selectionnee` simultanément). ✅ Le `devisId` est dérivé de l'option, pas d'un input → la remise à zéro ne touche que les options **du bon devis**.

### ✅ Scoping (endpoint public token-based) — pas d'IDOR cross-devis

`clientPortalRouter.selectDevisOption` (`server/routers.ts:2921`, `publicProcedure`) :
- résout le **token de signature** (`getSignatureByToken`) → NOT_FOUND si invalide ;
- vérifie `option.devisId === signature.devisId` (`:2936`) → on ne peut pas sélectionner l'option **d'un autre devis** ;
- **throttle** `checkPortalActionRate('sig:<id>')` (`:2940`) → pas de bascule en boucle.

### ✅ Gardes de cycle de vie

- `signature.signedAt` → BAD_REQUEST « déjà signé » (`:2929`) : on ne change pas l'option **après** signature (l'option choisie est figée à l'acceptation, cohérent avec Odoo où la formule alimente la commande à la confirmation).
- `signature.expiresAt` → BAD_REQUEST « lien expiré » (`:2932`).

### ✅ Lecture symétrique (getDevisForSignature)

La page de signature renvoie les options + lignes (`getDevisOptionsByDevisId` + `getDevisOptionLignesByOptionId`), avec le flag `recommandee` — le client voit les formules et sa sélection courante.

## Odoo 19

`sale_management/models/sale_order_option.py` (`sale.order.option`) : options proposées sur le devis en ligne, le client en **ajoute/choisit** ; la formule retenue alimente la commande **à l'acceptation**. Operioz reproduit l'essentiel MVP : présentation des options (badge recommandée), sélection unique côté portail avant signature, figée à la signature.

## Réserves / liens (déjà tracés — pas un défaut de cette feature)

- La **double-conversion** d'un devis en facture (1 devis → N factures) est un **autre** défaut, **déjà filé** : <issue id="OPE-68">OPE-68</issue> (HIGH). Indépendant de la sélection d'option.
- L'impact de l'option choisie sur les **totaux du devis/de la facture** (si chaque option porte ses propres lignes/total) relève du workflow d'acceptation ; non vérifié ici en profondeur (hors périmètre de cette passe « sélection »).

## Verdict

La **sélection d'option de devis par le client** (OPE-146) est **correcte** : invariant mono-sélection respecté (reset des frères), scoping token + appartenance au devis (pas d'IDOR cross-devis), throttle, gardes signé/expiré. **Aucun nouveau ticket benchmark.** (Anti-doublon : double-conversion devis→facture = <issue id="OPE-68">OPE-68</issue> déjà filé ; suppression client cassant les factures = <issue id="OPE-73">OPE-73</issue> déjà filé.)

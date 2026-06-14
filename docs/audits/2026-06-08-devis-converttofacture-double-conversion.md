# Audit — Devis→Facture : double conversion (double facturation) + aucun garde de statut

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `devis.convertToFacture` (`routers.ts:797`) →
> `createFactureFromDevis` (`db.ts:625`). Distinct d'OPE-40 (contrats.
> generateFacture), OPE-50 (immutabilité post-signature) et OPE-17 (permission
> `factures.creer` manquante sur cette route).

---

## Ce qui fonctionne correctement

- **Ownership** : `convertToFacture` vérifie `devis.artisanId !== artisan.id` ⇒
  FORBIDDEN (`:805`).
- La copie des lignes et des totaux (HT/TVA/TTC) depuis le devis est fidèle ; un
  `numero` de facture est alloué via `getNextFactureNumber`.

---

## 🟠 HIGH — Une conversion répétée crée plusieurs factures légales pour le même devis (double facturation)

### Problème

`createFactureFromDevis` **ne vérifie jamais qu'une facture a déjà été générée**
pour ce `devisId` (la table `factures` a pourtant une colonne `devisId`, écrite à
`:638`) :

```typescript
// db.ts:625 — aucune garde d'idempotence
export async function createFactureFromDevis(devisId: number) {
  const devisData = await getDevisById(devisId);
  const numero = await getNextFactureNumber(devisData.artisanId);
  await db.insert(factures).values({ ..., devisId: devisData.id, numero, totalTTC: ... });
  // copie des lignes ...
  await db.update(devis).set({ statut: 'accepte' })...;   // ← écrase le statut
}
```

→ Appeler `convertToFacture(devisId)` **deux fois** (double-clic, retry réseau, ou
appel direct de l'API) crée **deux factures distinctes** (chacune avec son propre
**numéro légal** issu de `getNextFactureNumber`), toutes deux liées au même devis.
Le garde « bouton désactivé » est **côté client** → contournable.

### Problème secondaire — aucun garde de statut

La conversion s'effectue **quel que soit le statut du devis** (`brouillon`,
`envoye`, **`refuse`**, `expire`) puis **force `statut='accepte'`** :

- Un devis **refusé** par le client peut être converti en facture → facturation de
  travaux **déclinés**, et le **refus est masqué** (statut réécrit en `accepte`).
- Un devis **brouillon** (montants provisoires, jamais envoyé) devient facturable.

### Impact

- **Double facturation du client** : deux factures finalisées pour la même
  prestation, chacune consommant un numéro de séquence légale → correction
  possible **uniquement par avoir** (CGI). Même gravité qu'OPE-40, autre chemin.
- **Facturation de devis non acceptés / refusés** + perte de traçabilité du refus.

### Fix proposé

1. **Idempotence** : avant insertion, `const existing = await
   getFactureByDevisId(devisId); if (existing) throw CONFLICT("Ce devis a déjà été
   converti en facture")` (ou renvoyer la facture existante). Idéalement une
   contrainte `UNIQUE(devisId)` partielle sur `factures` (en complément d'OPE-34).
2. **Garde de statut** : n'autoriser la conversion que depuis un devis **accepté/
   signé** (`statut === 'accepte'` et/ou présence d'une `signaturesDevis`) ;
   rejeter `brouillon`/`refuse`/`expire`.

### Estimation

~0,5 j — check facture existante + garde de statut + (option) contrainte UNIQUE +
test (double appel → 1 seule facture ; devis refusé → rejet).

---

## Estimation totale

- HIGH (double conversion devis→facture + statut non gardé) : ~0,5 j

# Audit — Paiement en ligne : une facture brouillon/annulée reste payable + portail expose les brouillons

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `POST /api/paiement/create-checkout-session` (`index.ts:798`) +
> exposition des factures au portail client (`clientPortal.getFactures` →
> `getFacturesByClientId`). Hors périmètre : routage Connect (OPE-6).

---

## Ce qui fonctionne correctement

- **Pas d'IDOR** : `facture.clientId !== access.clientId` ⇒ 404 (`:812`). Le client
  ne paie que ses propres factures.
- **Pas de price tampering** : `montantTTC` est lu depuis la **DB**
  (`facture.totalTTC`, `:838`), jamais depuis le body. Le client n'envoie que
  `factureId` + `token`.
- `GET /api/paiement/status` également scopé par token + `clientId`.

---

## 🟠 HIGH — Le backend n'autorise pas les bons statuts : facture **brouillon** ou **annulée** payable par requête directe

### Problème

Le seul garde de statut est `statut === 'payee'` (`index.ts:816`) :

```typescript
// index.ts:811-818
const facture = await getFactureById(factureId);
if (!facture || facture.clientId !== access.clientId) return 404;
if (facture.statut === 'payee') return 400;   // ← SEUL statut refusé
// ... crée la session Stripe pour N'IMPORTE quel autre statut
```

Or `getFacturesByClientId` (`db.ts`) renvoie **toutes** les factures du client,
**sans filtre de statut** :

```sql
SELECT * FROM factures WHERE clientId = ? ORDER BY createdAt DESC   -- inclut brouillon, validee, annulee
```

L'UI du portail ne montre le bouton « Payer en ligne » que pour
`statut === 'envoyee' || 'en_retard'` (`PortailClient.tsx:584`), **mais ce garde
est côté client**. Un client (qui possède un `token` de portail valide et voit les
`factureId` dans `getFactures`) peut **POST directement** vers
`/api/paiement/create-checkout-session` avec l'id d'une facture **`brouillon`**,
**`validee`** (pas encore envoyée) ou **`annulee`** → la session de paiement est
créée et la facture devient encaissable.

### Impact

- **Encaissement d'une facture annulée** : collecter un paiement sur un document
  **explicitement annulé** → obligation de remboursement, litige, et incohérence
  comptable (un `paiements` rattaché à une facture `annulee`).
- **Encaissement d'un brouillon** : collecter sur un document **non finalisé**
  (montants provisoires, numéro légal non arrêté, jamais envoyé au client).
- **Confidentialité** : le portail **expose au client** les factures `brouillon`
  et `annulee` de l'artisan (numéro, objet, `totalTTC`) — tarifs provisoires/non
  émis que l'artisan n'a pas l'intention de communiquer.

### Fix proposé

1. **Backend** : n'autoriser le paiement que pour des statuts **payables** —
   ```typescript
   const PAYABLE = ['envoyee', 'en_retard'];
   if (!PAYABLE.includes(facture.statut)) {
     return res.status(400).json({ error: "Cette facture n'est pas payable en ligne" });
   }
   ```
   (remplace le simple test `=== 'payee'`).
2. **Exposition portail** : `getFacturesByClientId` (ou `clientPortal.getFactures`)
   doit **exclure `brouillon`** (et ne pas proposer le paiement des `annulee`) →
   ne montrer au client que les factures **émises** (`envoyee`/`en_retard`/`payee`).

### Estimation

~0,5 j — allow-list de statut payable backend + filtre de statut sur la liste
portail + test (POST direct sur brouillon/annulee → 400).

---

## Réserves secondaires (déjà tracées)

- **Montant = `totalTTC` complet** ignorant `montantPaye` : un solde après acompte
  serait re-facturé en plein → relève d'**OPE-60** (paiement partiel ; aujourd'hui
  masqué car un acompte marque déjà `payee`).
- **Fuite de détail d'erreur** : le 500 renvoie `detail: error.message` (`:875`) —
  peut révéler l'état de config Stripe. Mineur, même classe que le leak déjà
  documenté (`fuite-info-erreurs-logs-ok.md`).

---

## Estimation totale

- HIGH (statut payable non vérifié + exposition brouillons) : ~0,5 j

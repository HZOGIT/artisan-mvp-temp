# Audit — Import CSV (clients / devis / factures)

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `importRouter` (`routers.ts:7820`) — import multi-ERP de clients,
> devis et factures via CSV (rows + mapping). Distinct d'OPE-34 (concurrence de
> numérotation) et OPE-24 (DoS importFromExcel).

---

## Ce qui fonctionne correctement

- **Scope artisan** : `importClients/importDevis/importFactures` créent via
  `createClient(artisan.id, …)` / `createDevis(artisan.id, …)` /
  `createFacture(artisan.id, …)`. Pas d'IDOR. ✓
- **Borne** : `rows: z.array(...).max(5000)` → pas de DoS illimité (mieux que
  l'`importFromExcel` d'OPE-24). ✓
- Déduplication des clients par email à l'import. ✓
- Rattachement devis/factures à un client existant par nom (sinon erreur
  remontée, ligne ignorée). ✓

---

## 🟠 HIGH — `importFactures` ne préserve pas le numéro d'origine : re-numérotation des factures historiques + rupture de séquence

### Problème

`importFactures` (`routers.ts:7946`) crée chaque facture **sans passer de
`numero`** — aucun champ `numeroFacture` n'est mappé :

```typescript
// routers.ts:7993-8002 — pas de numero, pas de totalHT/totalTVA
await db.createFacture(artisan.id, {
  clientId: client.id,
  objet: pickField(row, input.mapping, "objetFacture") || "Facture importée",
  statut: (pickField(row, input.mapping, "statut") || "brouillon") as any,
  dateFacture, dateEcheance, datePaiement, modePaiement,
  totalTTC: pickField(row, input.mapping, "totalTTC") || "0",
});
```

Or `createFacture` génère un numéro quand `data.numero` est absent :

```typescript
// db.ts createFacture
const numero = data.numero || await getNextFactureNumber(artisanId);
```

Donc **chaque facture historique importée reçoit un NOUVEAU numéro séquentiel
Operioz** (`FAC-00001`, …) — son **numéro légal d'origine est perdu**.

### Impact (légal / comptable)

1. **Perte des numéros légaux d'origine** : une facture émise « 2024-042 » dans
   l'ancien logiciel devient « FAC-000xx » dans Operioz. Or le numéro d'une
   facture **émise** est **immuable** (CGI) ; il figure dans la compta de
   l'artisan, chez le client, dans les déclarations passées. Les copies
   importées ne correspondent plus aux factures réellement émises.
2. **Rupture de l'ordre chronologique** : les factures historiques reçoivent des
   numéros attribués **à l'instant de l'import**, intercalés dans la séquence
   Operioz courante → numérotation non chronologique (une facture datée 2024 peut
   recevoir un numéro postérieur à une facture 2026 déjà saisie). Non conforme.
3. Combiné à OPE-34 (numérotation `MAX`-based non atomique), 5000 appels à
   `getNextFactureNumber` en boucle.

### Fix proposé

Mapper et **préserver** le numéro d'origine :

```typescript
const numeroOrigine = pickField(row, input.mapping, "numeroFacture");
await db.createFacture(artisan.id, {
  numero: numeroOrigine,        // ← conserve le numéro légal d'origine
  // ...
});
```

+ après import, **avancer le compteur** (`compteurFacture`) au-delà du plus grand
numéro importé pour éviter toute collision future (lié à OPE-34, idéalement avec
la contrainte `UNIQUE(artisanId, numero)`). Gérer les doublons de numéro à
l'import (ligne en erreur plutôt qu'un second `FAC` silencieux).

---

## Point secondaire (documenté, < HIGH)

**`totalHT` / `totalTVA` non importés** : seul `totalTTC` est repris ; `totalHT`
et `totalTVA` restent à leur défaut `0.00` et aucune ligne n'est créée. Les
factures importées ont donc un TTC sans ventilation TVA → la TVA collectée
(`getRapportTVA`) et le FEC (OPE-33) ignorent la TVA de ces factures. Acceptable
si l'import ne sert qu'à l'archivage hors période déclarative, mais à mapper
(`totalHT`, `tauxTVA`) pour des données cohérentes. (Même limite côté
`importDevis`.)

---

## Estimation totale

- HIGH (préservation du numéro de facture à l'import) : ~1 h

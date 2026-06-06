# Audit — PDF / FacturX / Mentions légales

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

---

## 🔴 BLOCKER 1 — FacturX "PDF" n'est pas un FacturX hybride : simple PDF sans XML embarqué

### Problème

La route `/api/comptabilite/facturx/:factureId` (index.ts:644) retourne un fichier nommé
`Facture_X_FacturX.pdf` mais c'est en réalité **un PDF jsPDF standard**, pas un PDF/A-3 hybride.

Un vrai FacturX doit être un **PDF/A-3b avec le XML CII embarqué en pièce jointe** portant le nom
`factur-x.xml` et les métadonnées XMP `fx:DocumentType=INVOICE`. Le XML est accessible via
`/api/comptabilite/facturx-xml/:factureId` mais séparément — les deux fichiers sont orphelins.

Conséquence concrète :
- Le fichier téléchargé est refusé par les logiciels comptables qui attendent un FacturX valide
  (Sage, Cegid, iBanFirst, les EDI des grandes enseignes)
- En cas d'audit fiscal, un document nommé "FacturX" mais non conforme peut être requalifié
- Chorus Pro (facture B2G obligatoire dès maintenant pour les marchés publics) exige un PDF/A-3
  avec XML embarqué

### Racine technique

```typescript
// server/_core/index.ts:660-665
const pdfBuffer = generateFacturePDF({ facture: { ...facture, lignes }, artisan, client });
res.setHeader('Content-Disposition', `attachment; filename="Facture_${facture.numero}_FacturX.pdf"`);
res.send(pdfBuffer);
// → PDF standard, zero XML, zero PDF/A-3 metadata
```

Le XML est généré séparément dans `facturx.ts` mais jamais injecté dans le PDF.

### Fix

Utiliser `pdf-lib` pour :
1. Prendre le buffer jsPDF existant
2. Intégrer le XML CII en embedded file attachment (`EmbeddedFile` avec MIME `text/xml`)
3. Ajouter les métadonnées XMP minimales PDF/A-3b + FacturX

```typescript
import { PDFDocument, PDFName, PDFString, PDFRawStream } from 'pdf-lib';

async function attachFacturXML(pdfBuffer: Buffer, xmlString: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const xmlBytes = Buffer.from(xmlString, 'utf-8');
  // Embed as file attachment named 'factur-x.xml' with relationship 'Alternative'
  // Set PDF/A-3b conformance metadata via XMP
  return Buffer.from(await pdfDoc.save());
}
```

### Estimation

~4h — `pdf-lib` est déjà dans l'écosystème npm, l'API d'embedding est documentée.

---

## 🔴 BLOCKER 2 — Profil FacturX MINIMUM : aucune ligne de facture dans le XML

### Problème

`server/_core/facturx.ts` génère le profil `urn:factur-x.eu:1p0:minimum`.

Le profil MINIMUM ne contient **pas de lignes** (`IncludedSupplyChainTradeLineItem`) — uniquement les
totaux globaux. Ce profil est réservé aux factures B2C et aux situations de simplification extrême.

Pour une utilisation comptable réelle (import dans Sage, Cegid, Pennylane...) il faut au minimum
le profil **EN 16931** (anciennement "COMFORT") qui inclut les lignes détaillées.

### Preuve

```xml
<!-- facturx.ts — profil actuel -->
<ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
<!-- Pas de section IncludedSupplyChainTradeLineItem -->
```

Résultat : un comptable qui importe ce XML voit une facture "500€ HT" sans savoir ce qui compose ce montant.

### Fix

Ajouter les lignes dans le XML et changer le profil :

```xml
<ram:ID>urn:factur-x.eu:1p0:en16931</ram:ID>
...
<!-- Pour chaque ligne -->
<ram:IncludedSupplyChainTradeLineItem>
  <ram:AssociatedDocumentLineDocument>
    <ram:LineID>${i + 1}</ram:LineID>
  </ram:AssociatedDocumentLineDocument>
  <ram:SpecifiedTradeProduct>
    <ram:Name>${escXml(ligne.designation)}</ram:Name>
  </ram:SpecifiedTradeProduct>
  <ram:SpecifiedLineTradeAgreement>
    <ram:NetPriceProductTradePrice>
      <ram:ChargeAmount>${Number(ligne.prixUnitaireHT).toFixed(2)}</ram:ChargeAmount>
    </ram:NetPriceProductTradePrice>
  </ram:SpecifiedLineTradeAgreement>
  <ram:SpecifiedLineTradeDelivery>
    <ram:BilledQuantity unitCode="C62">${Number(ligne.quantite).toFixed(2)}</ram:BilledQuantity>
  </ram:SpecifiedLineTradeDelivery>
  <ram:SpecifiedLineTradeSettlement>
    <ram:ApplicableTradeTax>
      <ram:TypeCode>VAT</ram:TypeCode>
      <ram:CategoryCode>S</ram:CategoryCode>
      <ram:RateApplicablePercent>${tauxTVA.toFixed(2)}</ram:RateApplicablePercent>
    </ram:ApplicableTradeTax>
    <ram:SpecifiedTradeSettlementLineMonetarySummation>
      <ram:LineTotalAmount>${lineTotalHT.toFixed(2)}</ram:LineTotalAmount>
    </ram:SpecifiedTradeSettlementLineMonetarySummation>
  </ram:SpecifiedLineTradeSettlement>
</ram:IncludedSupplyChainTradeLineItem>
```

### Estimation

~2h — mécanique XML, un bloc à répéter par ligne.

---

## 🟠 HIGH — Assurance décennale absente du schéma artisan → mention obligatoire impossible

### Problème

Pour les artisans du bâtiment (plomberie, électricité, chauffage — les 3 spécialités de la
plateforme), **la mention de l'assurance décennale est obligatoire sur les devis et factures**
(Art. L241-1 + L243-2 Code des assurances — Loi Spinetta).

La mention requise :
> "Assurance décennale : [Nom assureur], police n° [XXXXX], garantissant les travaux réalisés sur
> le territoire [Zone géographique]"

Or la table `artisans` (schema.ts:42) n'a aucun champ pour :
- `assureurDecennale` (nom de la compagnie)
- `numeroPoliceDecennale`
- `zoneGarantiDecennale`

Le PDF `generateDevisPDF` (pdfGenerator.ts:423) et `generateFacturePDF` (pdfGenerator.ts:508)
ne peuvent donc jamais inclure cette mention.

### Impact

Un artisan en plomberie qui émet un devis sans mention décennale :
- Commet une infraction à l'Art. L243-2 C. assurances (amende jusqu'à 75 000€, emprisonnement 6 mois)
- Le client peut demander la nullité du contrat
- En cas de sinistre, l'assureur peut refuser la couverture

### Fix

**Migration :**
```sql
ALTER TABLE artisans
  ADD COLUMN assureurDecennale VARCHAR(255) NULL,
  ADD COLUMN numeroPoliceDecennale VARCHAR(100) NULL,
  ADD COLUMN zoneGarantieDecennale VARCHAR(255) NULL;
```

**PDF footer (pdfGenerator.ts) :**
```typescript
if (a.assureurDecennale && a.numeroPoliceDecennale) {
  doc.text(
    `Assurance décennale : ${a.assureurDecennale} — Police n° ${a.numeroPoliceDecennale}`,
    MARGIN, footerY
  );
  footerY += 4;
}
```

**UI :** Ajouter les champs dans "Paramètres de l'entreprise" avec tooltip explicatif.

### Estimation

~3h — migration + PDF + UI settings

---

## 🟠 HIGH — Franchise TVA non gérée : micro-entrepreneurs génèrent des factures avec 20% TVA

### Problème

Le champ `tauxTVA` de la table `artisans` a une valeur par défaut de `20.00` (schema.ts:53).

Un **micro-entrepreneur en franchise en base de TVA** (CA < 37 500€ services / < 85 000€ ventes)
a l'obligation de :
1. Ne PAS facturer de TVA
2. Mentionner **obligatoirement** sur chaque facture : "TVA non applicable, art. 293 B du CGI"

Le code PDF (pdfGenerator.ts:477-479) utilise systématiquement :
```typescript
const tauxTVA = Number(artisan.tauxTVA) || 20;
const tva = sousTotal * (tauxTVA / 100);
```

Si l'artisan ne modifie pas son taux TVA après inscription, **ses factures afficheront 20% de TVA**
alors qu'il n'a pas le droit d'en collecter. Il est illégalement en train de facturer une TVA qu'il
devra reverser à l'État.

Même s'il met `tauxTVA = 0`, le PDF affiche "TVA (0%) : 0,00 €" au lieu de la mention légale.

### Fix

Ajouter un booléen `franchiseTVA` en schema + gestion dans le PDF :

**Migration :**
```sql
ALTER TABLE artisans ADD COLUMN franchiseTVA BOOLEAN NOT NULL DEFAULT FALSE;
```

**PDF (pdfGenerator.ts) :**
```typescript
if ((artisan as any).franchiseTVA) {
  // Pas de ligne TVA dans les totaux
  renderTotalsBox(doc, primary, totalsStartY, [], "TOTAL", `${sousTotal.toFixed(2)} €`);
  doc.text("TVA non applicable, art. 293 B du CGI.", MARGIN, Math.max(totalsEndY + 6, 255));
} else {
  const tauxTVA = Number(artisan.tauxTVA) || 20;
  // ... logique existante
}
```

**UI :** Case à cocher "Je suis en franchise en base de TVA (micro-entrepreneur)" dans paramètres.

### Estimation

~3h — migration + logique PDF + UI settings

---

## Ce qui fonctionne correctement

- Pénalités de retard facture correctement formulées (3x taux légal + 40€ — Art. L441-10) ✓
- SIRET affiché si renseigné ✓
- Numéro TVA intracommunautaire affiché si renseigné ✓
- Code APE affiché si renseigné ✓
- IBAN et coordonnées bancaires affichés si renseignés ✓
- Validité du devis affichée (30 jours par défaut) ✓
- Échappement XML correct dans facturx.ts (`escXml`) ✓
- Ownership check sur la facture avant génération ✓

---

## Estimation totale

- BLOCKER 1 (FacturX hybride PDF/A-3) : ~4h
- BLOCKER 2 (profil EN 16931 avec lignes) : ~2h
- HIGH (décennale) : ~3h
- HIGH (franchise TVA) : ~3h

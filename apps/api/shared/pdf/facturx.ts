import type { Facture, FactureLigne, Artisan, Client } from "./pdf-input-types";
import { TVA_CATEGORIES_MAP, type TvaCategorieId, tauxStringToCategorie } from "../tva/taux-tva-fr";

/**
 * Generates Factur-X XML (CII / ZUGFeRD MINIMUM profile)
 * Compliant with EN 16931 for French electronic invoicing 2026.
 * Emits one ApplicableTradeTax block per distinct TVA category (multi-category support).
 */
export function generateFacturXML(
  facture: Facture & { lignes: FactureLigne[] },
  artisan: Artisan,
  client: Client,
): string {
  const dateStr = formatCIIDate(facture.dateFacture ?? "");
  const echeanceStr = facture.dateEcheance ? formatCIIDate(facture.dateEcheance) : null;

  const totalHT = parseFloat(facture.totalHT?.toString() || "0");
  const totalTVA = parseFloat(facture.totalTVA?.toString() || "0");
  const totalTTC = parseFloat(facture.totalTTC?.toString() || "0");

  /*
   * Aggregate TVA per distinct tvaCategorieId from lines (EN 16931 : one block per category).
   * Lines of type section/note carry no price and are excluded.
   */
  const tvaByCategorie = new Map<TvaCategorieId, { baseHT: number; montantTVA: number; taux: number }>();
  for (const l of facture.lignes) {
    const type = String(l.type ?? "produit");
    if (type === "section" || type === "note") continue;
    const tvaCategorieId = (l.tvaCategorieId ?? "FR_20") as TvaCategorieId;
    const categorieDef = TVA_CATEGORIES_MAP[tvaCategorieId];
    const taux = parseFloat(categorieDef?.taux ?? String(l.tauxTVA ?? "0")) || 0;
    const ht = parseFloat(String(l.montantHT ?? "0")) || 0;
    const tva = parseFloat(String(l.montantTVA ?? "0")) || 0;
    const entry = tvaByCategorie.get(tvaCategorieId) ?? { baseHT: 0, montantTVA: 0, taux };
    entry.baseHT += ht;
    entry.montantTVA += tva;
    tvaByCategorie.set(tvaCategorieId, entry);
  }

  /** Fallback when lines have no montantHT/TVA (edge case): single block from totals. */
  const taxBlocks: { tvaCategorieId: TvaCategorieId; taux: number; baseHT: number; montantTVA: number }[] =
    tvaByCategorie.size > 0
      ? Array.from(tvaByCategorie.entries()).map(([tvaCategorieId, v]) => ({
          tvaCategorieId,
          taux: v.taux,
          baseHT: round2(v.baseHT),
          montantTVA: round2(v.montantTVA),
        }))
      : (() => {
          const categId = tauxStringToCategorie(artisan.tauxTVA);
          const def = TVA_CATEGORIES_MAP[categId];
          return [{ tvaCategorieId: categId, taux: parseFloat(def.taux), baseHT: totalHT, montantTVA: totalTVA }];
        })();

  const sellerName = escXml(artisan.nomEntreprise || "Artisan");
  const sellerAddr = escXml(artisan.adresse || "");
  const sellerCP = escXml(artisan.codePostal || "");
  const sellerVille = escXml(artisan.ville || "");
  const sellerSiret = escXml(artisan.siret || "");
  const sellerTVA = escXml(String(artisan.numeroTVA ?? ""));

  const buyerName = escXml(`${client.prenom || ""} ${client.nom}`.trim());
  const buyerAddr = escXml(client.adresse || "");
  const buyerCP = escXml(client.codePostal || "");
  const buyerVille = escXml(client.ville || "");

  const taxBlocksXml = taxBlocks
    .map((b) => {
      const codeFacturX = TVA_CATEGORIES_MAP[b.tvaCategorieId]?.codeFacturX ?? "S";
      return `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${b.montantTVA.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${b.baseHT.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>${codeFacturX}</ram:CategoryCode>
        <ram:RateApplicablePercent>${b.taux.toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escXml(facture.numero ?? "")}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${dateStr}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${sellerName}</ram:Name>${sellerSiret ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${sellerSiret}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ""}${sellerTVA ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${sellerTVA}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
        <ram:PostalTradeAddress>
          <ram:LineOne>${sellerAddr}</ram:LineOne>
          <ram:PostcodeCode>${sellerCP}</ram:PostcodeCode>
          <ram:CityName>${sellerVille}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${buyerName}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${buyerAddr}</ram:LineOne>
          <ram:PostcodeCode>${buyerCP}</ram:PostcodeCode>
          <ram:CityName>${buyerVille}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>Paiement a 30 jours</ram:Description>${echeanceStr ? `
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${echeanceStr}</udt:DateTimeString>
        </ram:DueDateDateTime>` : ""}
      </ram:SpecifiedTradePaymentTerms>
${taxBlocksXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${totalHT.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${totalHT.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${totalTVA.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${totalTTC.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${totalTTC.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

function round2(n: number): number {
  if (n === 0) return 0;
  const eps = Math.sign(n) * Math.pow(2, Math.floor(Math.log2(Math.abs(n))) - 50);
  return Math.round((n + eps) * 100) / 100;
}

function formatCIIDate(d: Date | string): string {
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

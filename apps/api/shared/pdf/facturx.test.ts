import { describe, it, expect } from "vitest";
import { generateFacturXML } from "./facturx";
import type { Facture, FactureLigne, Artisan, Client } from "./pdf-input-types";

const facture = (over: Partial<Facture> = {}): Facture & { lignes: FactureLigne[] } => ({
  numero: "FAC-001",
  dateFacture: new Date(2026, 2, 5), // 5 mars 2026 (local)
  dateEcheance: new Date(2026, 3, 4),
  totalHT: "100",
  totalTVA: "20",
  totalTTC: "120",
  lignes: [],
  ...over,
});
const artisan = (over: Partial<Artisan> = {}): Artisan => ({
  nomEntreprise: "Plomberie Durand",
  adresse: "1 rue A",
  codePostal: "75001",
  ville: "Paris",
  siret: "12345678900012",
  numeroTVA: "FR12345678900",
  ...over,
});
const client = (over: Partial<Client> = {}): Client => ({ prenom: "Marie", nom: "Martin", adresse: "2 rue B", codePostal: "69001", ville: "Lyon", ...over });

describe("generateFacturXML (Factur-X CII, profil MINIMUM)", () => {
  it("structure conforme : profil minimum, TypeCode 380, EUR, pays FR", () => {
    const xml = generateFacturXML(facture(), artisan(), client());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("urn:factur-x.eu:1p0:minimum");
    expect(xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(xml).toContain("<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>");
    expect(xml).toContain("<ram:CountryID>FR</ram:CountryID>");
    expect(xml).toContain("<ram:ID>FAC-001</ram:ID>");
  });

  it("avoir → TypeCode 381 (credit note EN 16931)", () => {
    const xml = generateFacturXML(facture({ typeDocument: "avoir" }), artisan(), client());
    expect(xml).toContain("<ram:TypeCode>381</ram:TypeCode>");
    expect(xml).not.toContain("<ram:TypeCode>380</ram:TypeCode>");
  });

  it("date émise + échéance au format CII 102 (YYYYMMDD)", () => {
    const xml = generateFacturXML(facture(), artisan(), client());
    expect(xml).toContain('<udt:DateTimeString format="102">20260305</udt:DateTimeString>');
    expect(xml).toContain('<udt:DateTimeString format="102">20260404</udt:DateTimeString>');
  });

  it("montants formatés à 2 décimales + taux TVA par défaut 20 si absent", () => {
    const xml = generateFacturXML(facture(), artisan({ tauxTVA: undefined }), client());
    expect(xml).toContain("<ram:GrandTotalAmount>120.00</ram:GrandTotalAmount>");
    expect(xml).toContain("<ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount>");
    expect(xml).toContain("<ram:RateApplicablePercent>20.00</ram:RateApplicablePercent>");
  });

  it("SIRET + n° TVA présents → blocs émis ; absents → blocs omis", () => {
    const avec = generateFacturXML(facture(), artisan(), client());
    expect(avec).toContain('<ram:ID schemeID="0002">12345678900012</ram:ID>');
    expect(avec).toContain('<ram:ID schemeID="VA">FR12345678900</ram:ID>');
    const sans = generateFacturXML(facture(), artisan({ siret: "", numeroTVA: "" }), client());
    expect(sans).not.toContain("SpecifiedLegalOrganization");
    expect(sans).not.toContain('schemeID="VA"');
  });

  it("acheteur = « prénom nom » ; échappement XML (anti-injection)", () => {
    const xml = generateFacturXML(facture(), artisan(), client({ prenom: "A&B", nom: "<Corp>" }));
    expect(xml).toContain("A&amp;B &lt;Corp&gt;");
    expect(xml).not.toContain("<Corp>");
  });

  it("sans échéance → pas de bloc DueDateDateTime", () => {
    const xml = generateFacturXML(facture({ dateEcheance: null }), artisan(), client());
    expect(xml).not.toContain("DueDateDateTime");
  });

  it("ligne FR_FRANCHISE (0%, franchise en base) → CategoryCode E", () => {
    const f = facture({
      lignes: [
        {
          designation: "Service",
          tvaCategorieId: "FR_FRANCHISE",
          tauxTVA: 0,
          montantHT: "100",
          montantTVA: "0",
        },
      ],
    });
    const xml = generateFacturXML(f, artisan(), client());
    expect(xml).toContain("<ram:CategoryCode>E</ram:CategoryCode>");
    expect(xml).not.toContain("<ram:CategoryCode>AE</ram:CategoryCode>");
  });

  it("ligne FR_AUTO (0%, autoliquidation) → CategoryCode AE", () => {
    const f = facture({
      lignes: [
        {
          designation: "Matériel",
          tvaCategorieId: "FR_AUTO",
          tauxTVA: 0,
          montantHT: "200",
          montantTVA: "0",
        },
      ],
    });
    const xml = generateFacturXML(f, artisan(), client());
    expect(xml).toContain("<ram:CategoryCode>AE</ram:CategoryCode>");
    expect(xml).not.toContain("<ram:CategoryCode>E</ram:CategoryCode>");
  });

  it("lignes mixtes (FR_20 + FR_FRANCHISE + FR_AUTO) → codes respectifs S, E, AE", () => {
    const f = facture({
      lignes: [
        {
          designation: "Normal 20%",
          tvaCategorieId: "FR_20",
          tauxTVA: 20,
          montantHT: "100",
          montantTVA: "20",
        },
        {
          designation: "Franchise",
          tvaCategorieId: "FR_FRANCHISE",
          tauxTVA: 0,
          montantHT: "100",
          montantTVA: "0",
        },
        {
          designation: "Auto",
          tvaCategorieId: "FR_AUTO",
          tauxTVA: 0,
          montantHT: "100",
          montantTVA: "0",
        },
      ],
    });
    const xml = generateFacturXML(f, artisan(), client());
    const matches = xml.match(/<ram:CategoryCode>[^<]+<\/ram:CategoryCode>/g) || [];
    expect(matches).toContain("<ram:CategoryCode>S</ram:CategoryCode>");
    expect(matches).toContain("<ram:CategoryCode>E</ram:CategoryCode>");
    expect(matches).toContain("<ram:CategoryCode>AE</ram:CategoryCode>");
  });
});

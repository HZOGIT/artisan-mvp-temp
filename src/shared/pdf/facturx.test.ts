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
});

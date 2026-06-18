import { describe, it, expect } from "vitest";
import { buildIIF, deriveSyncStatus, type ConfigComptable, type FactureIIF } from "./integration-comptable";

describe("buildIIF", () => {
  it("en-têtes !TRNS/!SPL/!ENDTRNS + 1 transaction INVOICE par facture (TTC débit, HT+TVA crédit)", () => {
    const facts: FactureIIF[] = [{ id: 1, numero: "FAC-1", dateFacture: new Date("2026-03-10"), totalHT: "100", totalTVA: "20", totalTTC: "120", clientNom: "Dupont", clientPrenom: "Jean" }];
    const iif = buildIIF(facts);
    const lines = iif.split("\n");
    expect(lines[0]).toContain("!TRNS");
    expect(lines[1]).toContain("!SPL");
    expect(lines[2]).toBe("!ENDTRNS");
    expect(iif).toContain("Jean Dupont");
    expect(iif).toContain("Accounts Receivable\tJean Dupont\t120.00");
    expect(iif).toContain("Sales\tJean Dupont\t-100.00"); // HT négatif
    expect(iif).toContain("Sales Tax Payable\tJean Dupont\t-20.00"); // TVA négatif
    expect(iif).toContain("ENDTRNS");
  });
  it("aucune facture → seulement les en-têtes", () => {
    expect(buildIIF([]).split("\n")).toHaveLength(3);
  });
});

describe("deriveSyncStatus", () => {
  const base: ConfigComptable = { logiciel: null, formatExport: null, compteVentes: null, compteTVACollectee: null, compteClients: null, compteAchats: null, compteTVADeductible: null, compteFournisseurs: null, compteBanque: null, compteCaisse: null, journalVentes: null, journalAchats: null, journalBanque: null, prefixeFacture: null, prefixeAvoir: null, exerciceDebut: null, actif: null, syncAutoFactures: null, syncAutoPaiements: null, frequenceSync: null, heureSync: null, notifierErreurs: null, notifierSucces: null, derniereSync: null, prochainSync: null };
  it("actif si sync auto factures OU paiements", () => {
    expect(deriveSyncStatus(null)).toEqual({ actif: false, derniereSync: null, prochainSync: null });
    expect(deriveSyncStatus({ ...base, syncAutoFactures: true }).actif).toBe(true);
    expect(deriveSyncStatus({ ...base, syncAutoPaiements: true }).actif).toBe(true);
    expect(deriveSyncStatus({ ...base, syncAutoFactures: false, syncAutoPaiements: false }).actif).toBe(false);
  });
});

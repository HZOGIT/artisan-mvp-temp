import { describe, it, expect } from "vitest";
import { calculerMontantsLigne, calculerTotaux } from "./montants";

describe("devis — calcul des montants de ligne (pur)", () => {
  it("ligne produit : HT = q×pu, TVA = HT×taux/100, TTC = HT+TVA", () => {
    expect(calculerMontantsLigne("produit", "2", "100.00", "20")).toEqual({
      montantHT: "200.00",
      montantTVA: "40.00",
      montantTTC: "240.00",
    });
  });

  it("ligne section/note : montants forcés à 0 (exclue des totaux)", () => {
    expect(calculerMontantsLigne("section", "5", "999.99", "20")).toEqual({
      montantHT: "0.00",
      montantTVA: "0.00",
      montantTTC: "0.00",
    });
    expect(calculerMontantsLigne("note", "1", "50.00", "20")).toEqual({
      montantHT: "0.00",
      montantTVA: "0.00",
      montantTTC: "0.00",
    });
  });

  it("taux réduit / taux 0", () => {
    expect(calculerMontantsLigne("produit", "1", "100.00", "10")).toEqual({ montantHT: "100.00", montantTVA: "10.00", montantTTC: "110.00" });
    expect(calculerMontantsLigne("produit", "1", "100.00", "0")).toEqual({ montantHT: "100.00", montantTVA: "0.00", montantTTC: "100.00" });
  });
});

describe("devis — calcul des totaux (pur)", () => {
  it("somme des montants de lignes ; section/note neutres", () => {
    const totaux = calculerTotaux([
      { montantHT: "200.00", montantTVA: "40.00", montantTTC: "240.00" },
      { montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" }, // section
      { montantHT: "100.00", montantTVA: "5.50", montantTTC: "105.50" },
    ]);
    expect(totaux).toEqual({ totalHT: "300.00", totalTVA: "45.50", totalTTC: "345.50" });
  });

  it("aucune ligne → totaux à 0", () => {
    expect(calculerTotaux([])).toEqual({ totalHT: "0.00", totalTVA: "0.00", totalTTC: "0.00" });
  });

  it("invariant totalTTC = totalHT + totalTVA", () => {
    const t = calculerTotaux([{ montantHT: "1234.56", montantTVA: "246.91", montantTTC: "1481.47" }]);
    expect(Number(t.totalTTC)).toBeCloseTo(Number(t.totalHT) + Number(t.totalTVA), 2);
  });
});

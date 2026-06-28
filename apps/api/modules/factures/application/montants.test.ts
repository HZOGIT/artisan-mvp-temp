import { describe, it, expect } from "vitest";
import { calculerMontantsLigne, calculerTotaux, calculerMontantsAvoirLigne, necessite_attestation_tva_reduite } from "./montants";

describe("factures — calcul des montants de ligne (pur)", () => {
  it("ligne produit : HT = q×pu, TVA = HT×taux/100, TTC = HT+TVA", () => {
    expect(calculerMontantsLigne("produit", "2", "100.00", "20")).toEqual({
      montantHT: "200.00",
      montantTVA: "40.00",
      montantTTC: "240.00",
    });
  });

  it("ligne section/note : montants forcés à 0 (exclue des totaux)", () => {
    expect(calculerMontantsLigne("section", "5", "999.99", "20")).toEqual({ montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" });
    expect(calculerMontantsLigne("note", "1", "50.00", "20")).toEqual({ montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" });
  });

  it("taux réduit / taux 0", () => {
    expect(calculerMontantsLigne("produit", "1", "100.00", "10")).toEqual({ montantHT: "100.00", montantTVA: "10.00", montantTTC: "110.00" });
    expect(calculerMontantsLigne("produit", "1", "100.00", "0")).toEqual({ montantHT: "100.00", montantTVA: "0.00", montantTTC: "100.00" });
  });

  it("résilience : entrées vides/non numériques → 0 (garde `Number(x) || 0`)", () => {
    expect(calculerMontantsLigne("produit", "", "100.00", "20")).toEqual({ montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" });
    expect(calculerMontantsLigne("produit", "2", "abc", "20")).toEqual({ montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" });
    expect(calculerMontantsLigne("produit", "2", "100.00", "xx")).toEqual({ montantHT: "200.00", montantTVA: "0.00", montantTTC: "200.00" }); // taux NaN → 0
  });

  it("arrondi au centime sur valeur non ronde (TVA 1.998 → 2.00)", () => {
    /* 3 × 3.33 = 9.99 HT ; TVA 20% = 1.998 → arrondi "2.00" ; TTC 11.988 → "11.99" */
    expect(calculerMontantsLigne("produit", "3", "3.33", "20")).toEqual({ montantHT: "9.99", montantTVA: "2.00", montantTTC: "11.99" });
  });

  it("remise 10% : HT = q×pu×(1 - r/100)", () => {
    expect(calculerMontantsLigne("produit", "10", "100", "20", "10")).toEqual({
      montantHT: "900.00",
      montantTVA: "180.00",
      montantTTC: "1080.00",
    });
  });

  it("remise 100% : HT et totaux = 0", () => {
    expect(calculerMontantsLigne("produit", "5", "200", "20", "100")).toEqual({
      montantHT: "0.00",
      montantTVA: "0.00",
      montantTTC: "0.00",
    });
  });
});

describe("factures — calcul des totaux (pur)", () => {
  it("somme des montants de lignes ; section/note neutres", () => {
    const totaux = calculerTotaux([
      { montantHT: "200.00", montantTVA: "40.00", montantTTC: "240.00" },
      { montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" },
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

describe("factures — montants d'avoir (pur, négatifs)", () => {
  it("ligne d'avoir : prixUnitaireHT et montants négatifs (note de crédit)", () => {
    expect(calculerMontantsAvoirLigne("2", "100.00", "20")).toEqual({
      prixUnitaireHT: "-100.00",
      montantHT: "-200.00",
      montantTVA: "-40.00",
      montantTTC: "-240.00",
    });
  });

  it("normalise les entrées déjà négatives (valeur absolue puis négation)", () => {
    expect(calculerMontantsAvoirLigne("-2", "-100.00", "20")).toEqual({
      prixUnitaireHT: "-100.00",
      montantHT: "-200.00",
      montantTVA: "-40.00",
      montantTTC: "-240.00",
    });
  });

  it("remise 10% : montantHT = -90.00", () => {
    expect(calculerMontantsAvoirLigne("1", "100", "20", "10")).toEqual({
      prixUnitaireHT: "-100.00",
      montantHT: "-90.00",
      montantTVA: "-18.00",
      montantTTC: "-108.00",
    });
  });
});

describe("necessite_attestation_tva_reduite (L1 — pur)", () => {
  it("renvoie true si une ligne est à 10 %", () => {
    expect(necessite_attestation_tva_reduite([{ tauxTVA: "20" }, { tauxTVA: "10" }])).toBe(true);
  });

  it("renvoie true si une ligne est à 5.5 %", () => {
    expect(necessite_attestation_tva_reduite([{ tauxTVA: "5.5" }])).toBe(true);
  });

  it("renvoie false si toutes les lignes sont à 20 %", () => {
    expect(necessite_attestation_tva_reduite([{ tauxTVA: "20" }, { tauxTVA: "20" }])).toBe(false);
  });

  it("renvoie false pour une liste vide", () => {
    expect(necessite_attestation_tva_reduite([])).toBe(false);
  });
});

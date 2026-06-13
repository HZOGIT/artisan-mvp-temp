import { describe, it, expect } from "vitest";
import { calculerTva } from "./tva";

describe("depenses — calcul TVA (pur)", () => {
  it("dérive TVA et TTC à 20% (cas nominal)", () => {
    expect(calculerTva("100.00", "20")).toEqual({ montantTva: "20.00", montantTtc: "120.00" });
  });

  it("arrondit la TVA au centime", () => {
    // 99.99 * 0.20 = 19.998 → 20.00 ; TTC = 119.99
    expect(calculerTva("99.99", "20")).toEqual({ montantTva: "20.00", montantTtc: "119.99" });
  });

  it("gère un taux réduit (10%)", () => {
    expect(calculerTva("250", "10")).toEqual({ montantTva: "25.00", montantTtc: "275.00" });
  });

  it("taux 0 → TVA nulle, TTC = HT", () => {
    expect(calculerTva("80", "0")).toEqual({ montantTva: "0.00", montantTtc: "80.00" });
  });

  it("invariant TTC = HT + TVA (tolérance d'arrondi)", () => {
    const { montantTva, montantTtc } = calculerTva("1234.56", "20");
    const ecart = Math.abs(Number(montantTtc) - (1234.56 + Number(montantTva)));
    expect(ecart).toBeLessThanOrEqual(0.01);
  });

  it("entrées non numériques → 0 (robustesse)", () => {
    expect(calculerTva("", "20")).toEqual({ montantTva: "0.00", montantTtc: "0.00" });
  });
});

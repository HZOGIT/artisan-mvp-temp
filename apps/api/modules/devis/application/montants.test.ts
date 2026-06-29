import { describe, it, expect } from "vitest";
import { calculerMontantsLigne, calculerTotaux, calculerSousTotauxParSection } from "./montants";

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

  it("résilience : entrées vides/non numériques → 0 (garde `Number(x) || 0`)", () => {
    expect(calculerMontantsLigne("produit", "", "100.00", "20")).toEqual({ montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" });
    expect(calculerMontantsLigne("produit", "2", "abc", "20")).toEqual({ montantHT: "0.00", montantTVA: "0.00", montantTTC: "0.00" });
    expect(calculerMontantsLigne("produit", "2", "100.00", "xx")).toEqual({ montantHT: "200.00", montantTVA: "0.00", montantTTC: "200.00" }); // taux NaN → 0
  });

  it("arrondi au centime sur valeur non ronde (TVA 1.998 → 2.00)", () => {
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

  it("remise ignorée pour section/note", () => {
    expect(calculerMontantsLigne("section", "1", "100", "20", "50")).toEqual({
      montantHT: "0.00",
      montantTVA: "0.00",
      montantTTC: "0.00",
    });
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

describe("devis — sous-totaux par section (pur)", () => {
  const l = (type: "produit" | "section" | "note", ht = "0.00", tva = "0.00", ttc = "0.00", designation = "") =>
    ({ type, designation, montantHT: ht, montantTVA: tva, montantTTC: ttc } as const);

  it("aucune section → Map vide", () => {
    expect(calculerSousTotauxParSection([l("produit", "100.00", "20.00", "120.00")])).toEqual(new Map());
  });

  it("section neutre (0 articles) → Map vide", () => {
    expect(calculerSousTotauxParSection([l("section", "0.00", "0.00", "0.00", "Lot 1")])).toEqual(new Map());
  });

  it("regroupement correct : sous-total après le dernier article du lot", () => {
    const lignes = [
      l("section", "0.00", "0.00", "0.00", "Lot 1 — Plomberie"),
      l("produit", "100.00", "20.00", "120.00"),
      l("produit", "200.00", "40.00", "240.00"),
      l("section", "0.00", "0.00", "0.00", "Lot 2 — Électricité"),
      l("produit", "50.00", "10.00", "60.00"),
    ] as const;
    const result = calculerSousTotauxParSection(lignes);
    expect(result.size).toBe(2);
    expect(result.get(2)).toEqual({ sectionLabel: "Lot 1 — Plomberie", totalHT: "300.00", totalTVA: "60.00", totalTTC: "360.00" });
    expect(result.get(4)).toEqual({ sectionLabel: "Lot 2 — Électricité", totalHT: "50.00", totalTVA: "10.00", totalTTC: "60.00" });
  });

  it("note dans un lot : ne contribue pas au sous-total, sous-total après la note", () => {
    const lignes = [
      l("section", "0.00", "0.00", "0.00", "Lot 1"),
      l("produit", "100.00", "20.00", "120.00"),
      l("note", "0.00", "0.00", "0.00"),
    ] as const;
    const result = calculerSousTotauxParSection(lignes);
    expect(result.get(2)).toEqual({ sectionLabel: "Lot 1", totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00" });
  });

  it("articles avant la première section : ignorés (pas de sous-total)", () => {
    const lignes = [
      l("produit", "999.00", "199.80", "1198.80"),
      l("section", "0.00", "0.00", "0.00", "Lot 1"),
      l("produit", "50.00", "10.00", "60.00"),
    ] as const;
    const result = calculerSousTotauxParSection(lignes);
    expect(result.size).toBe(1);
    expect(result.get(2)).toEqual({ sectionLabel: "Lot 1", totalHT: "50.00", totalTVA: "10.00", totalTTC: "60.00" });
  });
});

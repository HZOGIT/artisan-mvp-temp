import { describe, it, expect } from "vitest";
import { calculerEcartPct, evaluerTypeAlerte, choisirCanal, construireMessage, seuilOuDefaut } from "./alerte-prevision";

describe("calculerEcartPct", () => {
  it("écart % réalisé vs prévisionnel", () => {
    expect(calculerEcartPct(110, 100)).toBeCloseTo(10);
    expect(calculerEcartPct(80, 100)).toBeCloseTo(-20);
    expect(calculerEcartPct(100, 100)).toBe(0);
  });
});

describe("evaluerTypeAlerte", () => {
  it("dépassement positif au-delà du seuil positif", () => {
    expect(evaluerTypeAlerte(12, 10, 10)).toBe("depassement_positif");
  });
  it("dépassement négatif au-delà du seuil négatif", () => {
    expect(evaluerTypeAlerte(-15, 10, 10)).toBe("depassement_negatif");
  });
  it("dans la bande des seuils → null", () => {
    expect(evaluerTypeAlerte(5, 10, 10)).toBeNull();
    expect(evaluerTypeAlerte(-5, 10, 10)).toBeNull();
  });
  it("exactement au seuil → déclenché (>=, <=)", () => {
    expect(evaluerTypeAlerte(10, 10, 10)).toBe("depassement_positif");
    expect(evaluerTypeAlerte(-10, 10, 10)).toBe("depassement_negatif");
  });
});

describe("choisirCanal", () => {
  it("les_deux / email / sms / défaut email", () => {
    expect(choisirCanal(true, true)).toBe("les_deux");
    expect(choisirCanal(true, false)).toBe("email");
    expect(choisirCanal(false, true)).toBe("sms");
    expect(choisirCanal(false, false)).toBe("email");
    expect(choisirCanal(null, null)).toBe("email");
  });
});

describe("seuilOuDefaut (parité legacy Number(v || 10))", () => {
  it("falsy → 10 ; sinon Number(v)", () => {
    expect(seuilOuDefaut(null)).toBe(10);
    expect(seuilOuDefaut(undefined)).toBe(10);
    expect(seuilOuDefaut("")).toBe(10);
    expect(seuilOuDefaut("15.00")).toBe(15);
    expect(seuilOuDefaut("0.00")).toBe(0); // "0.00" truthy → 0 (parité exacte)
  });
});

describe("construireMessage", () => {
  it("positif et négatif, format legacy", () => {
    expect(construireMessage("depassement_positif", 1200, 1000, 20, 6, 2026)).toContain("Bonne nouvelle");
    expect(construireMessage("depassement_positif", 1200, 1000, 20, 6, 2026)).toContain("6/2026");
    expect(construireMessage("depassement_negatif", 800, 1000, -20, 6, 2026)).toContain("Attention");
    expect(construireMessage("depassement_negatif", 800, 1000, -20, 6, 2026)).toContain("20.0%");
  });
});

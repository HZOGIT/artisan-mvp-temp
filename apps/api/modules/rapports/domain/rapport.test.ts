import { describe, it, expect } from "vitest";
import { computeFinancier } from "./rapport";

describe("computeFinancier (pur)", () => {
  it("totalCA HT (payées + avoirs déduits) + compteurs", () => {
    const out = computeFinancier([
      { statut: "payee", totalHT: "83.00", typeDocument: "facture" },
      { statut: "payee", totalHT: "42.00", typeDocument: "facture" },
      { statut: "validee", totalHT: "-20.00", typeDocument: "avoir" },
      { statut: "envoyee", totalHT: "800.00", typeDocument: "facture" },
      { statut: "annulee", totalHT: "8.00", typeDocument: "facture" },
    ]);
    expect(out).toEqual([{ totalCA: 105, nombreFactures: 5, facturesPayees: 2 }]);
  });

  it("aucune facture → zéros", () => {
    expect(computeFinancier([])).toEqual([{ totalCA: 0, nombreFactures: 0, facturesPayees: 0 }]);
  });
});

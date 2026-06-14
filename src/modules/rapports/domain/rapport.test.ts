import { describe, it, expect } from "vitest";
import { computeFinancier } from "./rapport";

describe("computeFinancier (pur)", () => {
  it("totalCA (payées seulement) + compteurs", () => {
    const out = computeFinancier([
      { statut: "payee", totalTTC: "100.00" },
      { statut: "payee", totalTTC: "50.50" },
      { statut: "envoyee", totalTTC: "999.00" },
      { statut: "annulee", totalTTC: "10.00" },
    ]);
    expect(out).toEqual([{ totalCA: 150.5, nombreFactures: 4, facturesPayees: 2 }]);
  });

  it("aucune facture → zéros", () => {
    expect(computeFinancier([])).toEqual([{ totalCA: 0, nombreFactures: 0, facturesPayees: 0 }]);
  });
});

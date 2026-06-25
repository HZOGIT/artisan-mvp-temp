import { describe, it, expect } from "vitest";
import { computeDevisStats } from "./devis-stats";

describe("computeDevisStats (pur)", () => {
  it("agrège total, parStatut (défaut brouillon) et somme TTC", () => {
    const stats = computeDevisStats([
      { statut: "accepte", totalTTC: "100.00" },
      { statut: "accepte", totalTTC: "200.50" },
      { statut: "brouillon", totalTTC: "50.00" },
      { statut: null, totalTTC: null }, // statut null → brouillon ; TTC null → 0
    ]);
    expect(stats.total).toBe(4);
    expect(stats.parStatut).toEqual({ accepte: 2, brouillon: 2 });
    expect(stats.montantTotal).toBe(350.5);
  });

  it("lot vide → zéros", () => {
    expect(computeDevisStats([])).toEqual({ total: 0, parStatut: {}, montantTotal: 0 });
  });

  it("TTC non numérique → ignoré (0), pas de NaN", () => {
    const stats = computeDevisStats([{ statut: "envoye", totalTTC: "abc" }]);
    expect(stats.montantTotal).toBe(0);
    expect(stats.parStatut).toEqual({ envoye: 1 });
  });

  it("montantTotal arrondi à 2 décimales — anti-régression drift float", () => {
    const stats = computeDevisStats([
      { statut: "accepte", totalTTC: "0.1" },
      { statut: "accepte", totalTTC: "0.2" },
    ]);
    expect(stats.montantTotal).toBe(0.3);
  });
});

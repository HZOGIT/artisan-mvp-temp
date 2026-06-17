import { describe, expect, it } from "vitest";
import { eur, alertesBudget, totalBudget, pctBudget, projection, type Budget } from "./tableau-bord-depenses";

const b = (categorie: string, budget: number, pct: number): Budget => ({ categorie, budget, pct, reel: 0, ecart: 0 } as unknown as Budget);

describe("tableau-bord-depenses — domain pur", () => {
  it("eur : entiers €, tolérant string/null", () => {
    expect(eur(1500)).toContain("€");
    expect(eur("2000.5")).toContain("2");
    expect(eur(null)).toContain("0");
  });

  it("alertesBudget : budget>0 et pct≥80", () => {
    const list = [b("A", 100, 85), b("B", 100, 50), b("C", 0, 90)];
    expect(alertesBudget(list).map((x) => x.categorie)).toEqual(["A"]);
  });

  it("totalBudget / pctBudget", () => {
    expect(totalBudget([b("A", 100, 0), b("B", 200, 0)])).toBe(300);
    expect(pctBudget(150, 300)).toBe(50);
    expect(pctBudget(150, 0)).toBe(0);
  });

  it("projection : extrapolation linéaire au mois courant, null sinon", () => {
    const now = new Date(2026, 5, 15); // 15 juin 2026 (30 j)
    expect(projection(1000, "2026-06", now)).toBe(1000 * (30 / 15)); // 2000
    expect(projection(1000, "2026-05", now)).toBeNull(); // pas le mois courant
    expect(projection(0, "2026-06", now)).toBeNull();
  });
});

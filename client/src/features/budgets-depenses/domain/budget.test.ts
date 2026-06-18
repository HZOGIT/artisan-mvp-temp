import { describe, expect, it } from "vitest";
import {
  budgetTotals,
  consommationPct,
  moisPrecedent,
  budgetLevel,
  clampPct,
  type Budget,
} from "./budget";

const mk = (p: Partial<Budget>): Budget =>
  ({ categorie: "", budget: 0, reel: 0, pct: 0, couleur: "#000", ...p } as unknown as Budget);

describe("budgetTotals", () => {
  it("somme budget / réalisé / restant", () => {
    const list = [mk({ budget: 100, reel: 40 }), mk({ budget: 50, reel: 60 })];
    expect(budgetTotals(list)).toEqual({ budget: 150, reel: 100, restant: 50 });
  });
  it("tolère valeurs string/non numériques", () => {
    expect(budgetTotals([mk({ budget: "abc" as unknown as number, reel: "30" as unknown as number })])).toEqual({
      budget: 0,
      reel: 30,
      restant: -30,
    });
  });
});

describe("consommationPct", () => {
  it("réalisé / budget arrondi", () => {
    expect(consommationPct({ budget: 200, reel: 50, restant: 150 })).toBe(25);
  });
  it("null si budget nul", () => {
    expect(consommationPct({ budget: 0, reel: 10, restant: -10 })).toBeNull();
  });
});

describe("moisPrecedent", () => {
  it("mois précédent (gère le passage d'année)", () => {
    expect(moisPrecedent("2026-06")).toBe("2026-05");
    expect(moisPrecedent("2026-01")).toBe("2025-12");
  });
});

describe("budgetLevel", () => {
  it("seuils ok / warn / over", () => {
    expect(budgetLevel(50)).toBe("ok");
    expect(budgetLevel(75)).toBe("ok");
    expect(budgetLevel(76)).toBe("warn");
    expect(budgetLevel(100)).toBe("warn");
    expect(budgetLevel(101)).toBe("over");
  });
});

describe("clampPct", () => {
  it("borne entre 0 et 100", () => {
    expect(clampPct(150)).toBe(100);
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(42)).toBe(42);
  });
});

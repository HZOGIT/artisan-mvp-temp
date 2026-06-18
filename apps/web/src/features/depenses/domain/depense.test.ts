import { describe, expect, it } from "vitest";
import {
  budgetTotal,
  indexCategoriesByNom,
  montantIndemniteKm,
  monthRange,
  buildTrajetMotif,
  TARIF_KM_DEFAULT,
  type Budget,
  type Categorie,
} from "./depense";

const mkB = (budget: string | number): Budget => ({ budget } as unknown as Budget);
const mkC = (p: Partial<Categorie> & { id: number; nom: string }): Categorie =>
  ({ couleur: "#000", ...p } as unknown as Categorie);

describe("budgetTotal", () => {
  it("somme les budgets, tolère string/null", () => {
    expect(budgetTotal([mkB("100"), mkB(50), mkB("abc")])).toBe(150);
    expect(budgetTotal([])).toBe(0);
  });
});

describe("indexCategoriesByNom", () => {
  it("indexe par nom", () => {
    const map = indexCategoriesByNom([mkC({ id: 1, nom: "Carburant", couleur: "#f00" }), mkC({ id: 2, nom: "Repas" })]);
    expect(map.get("Carburant")?.couleur).toBe("#f00");
    expect(map.get("Inconnu")).toBeUndefined();
  });
});

describe("montantIndemniteKm", () => {
  it("km × tarif arrondi 2 décimales", () => {
    expect(montantIndemniteKm(100, TARIF_KM_DEFAULT)).toBe(52.9);
    expect(montantIndemniteKm(12.3, 0.529)).toBe(6.51);
    expect(montantIndemniteKm(0, 0.529)).toBe(0);
  });
});

describe("monthRange", () => {
  it("1er et dernier jour du mois", () => {
    expect(monthRange("2026-02")).toEqual({ debut: "2026-02-01", fin: "2026-02-28" });
    expect(monthRange("2024-02")).toEqual({ debut: "2024-02-01", fin: "2024-02-29" }); // bissextile
    expect(monthRange("2026-12")).toEqual({ debut: "2026-12-01", fin: "2026-12-31" });
  });
});

describe("buildTrajetMotif", () => {
  it("compose trajet + motif, vide si rien", () => {
    expect(buildTrajetMotif("Paris", "Lyon", "Chantier")).toBe("Paris → Lyon — Chantier");
    expect(buildTrajetMotif("Paris", "", "")).toBe("Paris → ?");
    expect(buildTrajetMotif("", "", "Visite")).toBe("Visite");
    expect(buildTrajetMotif("", "", "")).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { normalizeMotif, isRegleValid, indexCategoriesByNom, type Categorie } from "./regle";

const mkC = (p: Partial<Categorie> & { id: number; nom: string }): Categorie =>
  ({ couleur: "#000", ...p } as unknown as Categorie);

describe("normalizeMotif", () => {
  it("trim + majuscules", () => {
    expect(normalizeMotif("  brico depot ")).toBe("BRICO DEPOT");
    expect(normalizeMotif("total")).toBe("TOTAL");
  });
});

describe("isRegleValid", () => {
  it("motif non vide + catégorie choisie", () => {
    expect(isRegleValid("TOTAL", "Carburant")).toBe(true);
    expect(isRegleValid("  ", "Carburant")).toBe(false);
    expect(isRegleValid("TOTAL", "")).toBe(false);
    expect(isRegleValid("", "")).toBe(false);
  });
});

describe("indexCategoriesByNom", () => {
  it("indexe par nom", () => {
    const map = indexCategoriesByNom([mkC({ id: 1, nom: "Carburant", couleur: "#f00" }), mkC({ id: 2, nom: "Repas" })]);
    expect(map.get("Carburant")?.couleur).toBe("#f00");
    expect(map.get("Inconnu")).toBeUndefined();
  });
});

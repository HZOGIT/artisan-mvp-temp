import { describe, it, expect } from "vitest";
import { isSearchable } from "./public-article-search";

// Garde de parité legacy : la recherche publique du catalogue n'interroge la base que si la requête
// fait >= 2 caractères APRÈS trim (sinon la route renvoie []). Anti-scraping / autocomplete.
describe("isSearchable", () => {
  it("requête de 2 caractères ou plus → exploitable", () => {
    expect(isSearchable("ab")).toBe(true);
    expect(isSearchable("vis")).toBe(true);
  });

  it("requête trop courte (< 2 caractères) → non exploitable", () => {
    expect(isSearchable("")).toBe(false);
    expect(isSearchable("a")).toBe(false);
  });

  it("trim avant comptage : espaces seuls ou 1 caractère entouré d'espaces → non exploitable", () => {
    expect(isSearchable("   ")).toBe(false);
    expect(isSearchable("  a  ")).toBe(false);
  });

  it("le trim ne disqualifie pas une requête valide entourée d'espaces", () => {
    expect(isSearchable("  ab  ")).toBe(true);
  });
});

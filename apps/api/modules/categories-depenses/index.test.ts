import { describe, it, expect } from "vitest";
import * as categoriesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite.
describe("categories-depenses — barrel (contrat public)", () => {
  it("expose le factory createCategoriesDepensesModule", () => {
    expect(typeof categoriesPublic.createCategoriesDepensesModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("CategorieDepenseRepositoryDrizzle" in categoriesPublic).toBe(false);
    expect("FakeCategorieDepenseRepository" in categoriesPublic).toBe(false);
  });
});

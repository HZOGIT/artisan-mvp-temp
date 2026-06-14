import { describe, it, expect } from "vitest";
import * as budgetsPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite.
describe("budgets-categories — barrel (contrat public)", () => {
  it("expose le factory createBudgetsCategoriesModule", () => {
    expect(typeof budgetsPublic.createBudgetsCategoriesModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("BudgetCategorieRepositoryDrizzle" in budgetsPublic).toBe(false);
    expect("FakeBudgetCategorieRepository" in budgetsPublic).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { createBudgetsCategoriesModule } from "./budgets-categories.module";
import type { IBudgetCategorieRepository } from "./application/budget-categorie-repository";

const stubRepo: IBudgetCategorieRepository = {
  list: async () => [],
  listByMois: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  withDb: () => stubRepo,
};

describe("budgets-categories.module", () => {
  it("createBudgetsCategoriesModule câble le repository injecté", () => {
    const module = createBudgetsCategoriesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose CRUD + listByMois + withDb attendus", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "listByMois", "update", "withDb"]);
  });

  it("expose un routeur tRPC assemblé (CRUD + byMois + copierBudgetsMois)", () => {
    const module = createBudgetsCategoriesModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["byMois", "copierBudgetsMois", "create", "delete", "getById", "list", "update"]);
  });
});

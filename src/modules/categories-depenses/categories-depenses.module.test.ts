import { describe, it, expect } from "vitest";
import { createCategoriesDepensesModule } from "./categories-depenses.module";
import type { ICategorieDepenseRepository } from "./application/categorie-depense-repository";

const stubRepo: ICategorieDepenseRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("categories-depenses.module", () => {
  it("createCategoriesDepensesModule câble le repository injecté", () => {
    const module = createCategoriesDepensesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD catalogue attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

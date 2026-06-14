import { describe, it, expect } from "vitest";
import { createDepensesModule } from "./depenses.module";
import type { IDepenseRepository } from "./application/depense-repository";
import type { ICategorieDepenseRepository } from "../categories-depenses/application/categorie-depense-repository";

const stubRepo: IDepenseRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  ownsRef: async () => false,
  nextNumero: async () => "DEP-00001",
};

const stubCategorieRepo: ICategorieDepenseRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("depenses.module", () => {
  it("createDepensesModule câble le repository injecté", () => {
    const module = createDepensesModule({ repository: stubRepo, categorieRepository: stubCategorieRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "nextNumero", "ownsRef", "update"]);
  });

  it("expose les procédures de catégories (parité client trpc.depenses.*Categorie)", () => {
    const module = createDepensesModule({ repository: stubRepo, categorieRepository: stubCategorieRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record);
    expect(procedures).toEqual(expect.arrayContaining(["getCategories", "createCategorie", "updateCategorie", "deleteCategorie"]));
  });
});

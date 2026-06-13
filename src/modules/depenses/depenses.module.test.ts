import { describe, it, expect } from "vitest";
import { createDepensesModule } from "./depenses.module";
import type { IDepenseRepository } from "./application/depense-repository";

const stubRepo: IDepenseRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  ownsRef: async () => false,
};

describe("depenses.module", () => {
  it("createDepensesModule câble le repository injecté", () => {
    const module = createDepensesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "ownsRef", "update"]);
  });
});

import { describe, it, expect } from "vitest";
import { createInterventionsModule } from "./interventions.module";
import type { IInterventionRepository } from "./application/intervention-repository";

const stubRepo: IInterventionRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("interventions.module", () => {
  it("createInterventionsModule câble le repository injecté", () => {
    const module = createInterventionsModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

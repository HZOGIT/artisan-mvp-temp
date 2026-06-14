import { describe, it, expect } from "vitest";
import { createReglesCategorisationModule } from "./regles-categorisation.module";
import type { IRegleCategorisationRepository } from "./application/regle-categorisation-repository";

const stubRepo: IRegleCategorisationRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("regles-categorisation.module", () => {
  it("createReglesCategorisationModule câble le repository injecté", () => {
    const module = createReglesCategorisationModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose le CRUD attendu", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

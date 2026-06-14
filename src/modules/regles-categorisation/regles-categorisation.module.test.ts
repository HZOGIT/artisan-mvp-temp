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

  it("expose un routeur tRPC assemblé (CRUD)", () => {
    const module = createReglesCategorisationModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

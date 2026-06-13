import { describe, it, expect } from "vitest";
import { createTechniciensModule } from "./techniciens.module";
import type { ITechnicienRepository } from "./application/technicien-repository";

const stubRepo: ITechnicienRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("techniciens.module (scaffold)", () => {
  it("createTechniciensModule câble le repository injecté", () => {
    const module = createTechniciensModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

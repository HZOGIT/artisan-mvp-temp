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
  listDisponibilites: async () => [],
  setDisponibilite: async () => null,
  getDernierePosition: async () => null,
  enregistrerPosition: async () => null,
};

describe("techniciens.module", () => {
  it("createTechniciensModule câble le repository injecté", () => {
    const module = createTechniciensModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "create",
      "delete",
      "enregistrerPosition",
      "getById",
      "getDernierePosition",
      "list",
      "listDisponibilites",
      "setDisponibilite",
      "update",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createTechniciensModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "create",
      "delete",
      "enregistrerPosition",
      "getAll",
      "getById",
      "getDernierePosition",
      "getDisponibilites",
      "list",
      "setDisponibilite",
      "update",
    ]);
  });
});

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
  ownsRef: async () => false,
  findTechnicienIdForUser: async () => null,
  listByTechnicien: async () => [],
  listEquipe: async () => [],
  listEquipesArtisan: async () => [],
  addMembreEquipe: async () => {
    throw new Error("non implémenté (stub)");
  },
  removeMembreEquipe: async () => {},
};

describe("interventions.module", () => {
  it("createInterventionsModule câble le repository injecté", () => {
    const module = createInterventionsModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "addMembreEquipe",
      "create",
      "delete",
      "findTechnicienIdForUser",
      "getById",
      "list",
      "listByTechnicien",
      "listEquipe",
      "listEquipesArtisan",
      "ownsRef",
      "removeMembreEquipe",
      "update",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createInterventionsModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "ajouterMembreEquipe",
      "create",
      "delete",
      "getById",
      "getEquipe",
      "getEquipesByArtisan",
      "getMine",
      "list",
      "retirerMembreEquipe",
      "update",
    ]);
  });
});

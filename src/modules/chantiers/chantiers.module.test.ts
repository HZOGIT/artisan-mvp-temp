import { describe, it, expect } from "vitest";
import { createChantiersModule } from "./chantiers.module";
import type { IChantierRepository } from "./application/chantier-repository";

const stubRepo: IChantierRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  ownsClient: async () => false,
  ownsTechnicien: async () => false,
  listPointages: async () => [],
  addPointage: async () => null,
  deletePointage: async () => false,
  listSuivi: async () => [],
  getSuiviById: async () => null,
  addSuivi: async () => {
    throw new Error("non implémenté (stub)");
  },
  updateSuivi: async () => null,
  deleteSuivi: async () => false,
};

describe("chantiers.module", () => {
  it("createChantiersModule câble le repository injecté", () => {
    const module = createChantiersModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "addPointage",
      "addSuivi",
      "create",
      "delete",
      "deletePointage",
      "deleteSuivi",
      "getById",
      "getSuiviById",
      "list",
      "listPointages",
      "listSuivi",
      "ownsClient",
      "ownsTechnicien",
      "update",
      "updateSuivi",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createChantiersModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "addPointage",
      "create",
      "createSuivi",
      "delete",
      "deletePointage",
      "deleteSuivi",
      "getById",
      "getPointages",
      "getSuivi",
      "list",
      "update",
      "updateSuivi",
    ]);
  });
});

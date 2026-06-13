import { describe, it, expect } from "vitest";
import { createCongesModule } from "./conges.module";
import type { ICongeRepository } from "./application/conge-repository";

const stubRepo: ICongeRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  ownsTechnicien: async () => false,
};

describe("conges.module", () => {
  it("createCongesModule câble le repository injecté", () => {
    const module = createCongesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "ownsTechnicien", "update"]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createCongesModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

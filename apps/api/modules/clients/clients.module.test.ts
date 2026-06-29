import { describe, it, expect } from "vitest";
import { createClientsModule } from "./clients.module";
import type { IClientRepository } from "./application/client-repository";

const stubRepo: IClientRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  countDocumentsLies: async () => 0,
  fusionner: async () => null,
  search: async () => [],
  listFacturesPourEncours: async () => [],
};

describe("clients.module", () => {
  it("createClientsModule câble le repository injecté", () => {
    const module = createClientsModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "countDocumentsLies",
      "create",
      "delete",
      "fusionner",
      "getById",
      "list",
      "listFacturesPourEncours",
      "search",
      "update",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createClientsModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "create",
      "delete",
      "envoyerMessage",
      "fusionner",
      "getById",
      "getEncours",
      "getEncoursMap",
      "importFromExcel",
      "list",
      "search",
      "update",
    ]);
  });
});

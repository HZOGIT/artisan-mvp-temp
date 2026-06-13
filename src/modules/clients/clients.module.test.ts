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
      "getById",
      "list",
      "update",
    ]);
  });
});

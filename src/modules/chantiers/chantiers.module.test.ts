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
};

describe("chantiers.module", () => {
  it("createChantiersModule câble le repository injecté", () => {
    const module = createChantiersModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "ownsClient", "update"]);
  });
});

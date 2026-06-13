import { describe, it, expect } from "vitest";
import { createCommandesModule } from "./commandes.module";
import type { ICommandeRepository } from "./application/commande-repository";

const stubRepo: ICommandeRepository = {
  list: async () => [],
  getById: async () => null,
  listLignes: async () => [],
  create: async () => null,
  update: async () => null,
  delete: async () => false,
};

describe("commandes.module (scaffold)", () => {
  it("createCommandesModule câble le repository injecté", () => {
    const module = createCommandesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "listLignes", "update"]);
  });
});

import { describe, it, expect } from "vitest";
import { createFournisseursModule } from "./fournisseurs.module";
import type { IFournisseurRepository } from "./application/fournisseur-repository";

const stubRepo: IFournisseurRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("fournisseurs.module (scaffold)", () => {
  it("createFournisseursModule câble le repository injecté", () => {
    const module = createFournisseursModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

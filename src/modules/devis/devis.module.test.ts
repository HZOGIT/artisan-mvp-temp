import { describe, it, expect } from "vitest";
import { createDevisModule } from "./devis.module";
import type { IDevisRepository } from "./application/devis-repository";

const stubRepo: IDevisRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  nextNumero: async () => "DEV-00001",
  ownsClient: async () => false,
  listLignes: async () => [],
  addLigne: async () => null,
  updateLigne: async () => null,
  deleteLigne: async () => false,
};

describe("devis.module", () => {
  it("createDevisModule câble le repository injecté", () => {
    const module = createDevisModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues (CRUD + numéro + ownership + lignes)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "addLigne",
      "create",
      "delete",
      "deleteLigne",
      "getById",
      "list",
      "listLignes",
      "nextNumero",
      "ownsClient",
      "update",
      "updateLigne",
    ]);
  });
});

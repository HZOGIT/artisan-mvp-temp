import { describe, it, expect } from "vitest";
import { createFacturesModule } from "./factures.module";
import type { IFactureRepository } from "./application/facture-repository";

const stubRepo: IFactureRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  setStatut: async () => null,
  nextNumero: async () => "FAC-00001",
  ownsClient: async () => false,
  ownsDevis: async () => false,
  listLignes: async () => [],
  addLigne: async () => null,
  updateLigne: async () => null,
  deleteLigne: async () => false,
};

describe("factures.module", () => {
  it("createFacturesModule câble le repository injecté", () => {
    const module = createFacturesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues (CRUD + statut + numéro + ownership + lignes)", () => {
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
      "ownsDevis",
      "setStatut",
      "update",
      "updateLigne",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité CRUD + lignes)", () => {
    const module = createFacturesModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "addLigne",
      "create",
      "delete",
      "deleteLigne",
      "getById",
      "getLignes",
      "list",
      "update",
      "updateLigne",
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { createContratsMaintenanceModule } from "./contrats-maintenance.module";
import type { IContratRepository } from "./application/contrat-repository";

const stubRepo: IContratRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  setStatut: async () => null,
  delete: async () => false,
  ownsClient: async () => false,
  nextReference: async () => "CTR-00001",
};

describe("contrats-maintenance.module", () => {
  it("createContratsMaintenanceModule câble le repository injecté", () => {
    const module = createContratsMaintenanceModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose CRUD + setStatut + ownsClient + nextReference (anti-IDOR + référence serveur)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "nextReference", "ownsClient", "setStatut", "update"]);
  });

  it("expose un routeur tRPC assemblé (CRUD + transitions suspendre/reactiver/terminer/annuler)", () => {
    const module = createContratsMaintenanceModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["annuler", "create", "delete", "getById", "list", "reactiver", "suspendre", "terminer", "update"]);
  });
});

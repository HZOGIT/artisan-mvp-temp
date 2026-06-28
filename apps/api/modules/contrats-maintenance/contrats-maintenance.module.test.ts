import { describe, it, expect } from "vitest";
import { createContratsMaintenanceModule } from "./contrats-maintenance.module";
import type { IContratRepository } from "./application/contrat-repository";
import type { ContratFactureGenerator } from "./application/contrat-facture-generator";

const stubFactureGen: ContratFactureGenerator = {
  genererFactureEmise: async () => ({ id: 1, numero: "FAC-00001" }),
};

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
  listAFacturer: async () => [],
  listInterventions: async () => [],
  getInterventionById: async () => null,
  createIntervention: async () => {
    throw new Error("non implémenté (stub)");
  },
  updateIntervention: async () => null,
  recordFactureRecurrente: async () => {},
};

describe("contrats-maintenance.module", () => {
  it("createContratsMaintenanceModule câble le repository injecté", () => {
    const module = createContratsMaintenanceModule({ repository: stubRepo, factureGenerator: stubFactureGen });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose CRUD + setStatut + ownsClient + nextReference + à-facturer + interventions", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "create",
      "createIntervention",
      "delete",
      "getById",
      "getInterventionById",
      "list",
      "listAFacturer",
      "listInterventions",
      "nextReference",
      "ownsClient",
      "recordFactureRecurrente",
      "setStatut",
      "update",
      "updateIntervention",
    ]);
  });

  it("expose un routeur tRPC assemblé (CRUD + transitions + getAFacturer + interventions)", () => {
    const module = createContratsMaintenanceModule({ repository: stubRepo, factureGenerator: stubFactureGen });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "annuler",
      "create",
      "createIntervention",
      "delete",
      "generateFacture",
      "getAFacturer",
      "getById",
      "getInterventions",
      "list",
      "reactiver",
      "reviserPrix",
      "suspendre",
      "terminer",
      "update",
      "updateIntervention",
    ]);
  });
});

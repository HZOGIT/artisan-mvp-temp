import { describe, it, expect } from "vitest";
import { createCommandesModule } from "./commandes.module";
import type { ICommandeRepository } from "./application/commande-repository";
import type { IFournisseurRepository } from "../fournisseurs/application/fournisseur-repository";

const stubRepo: ICommandeRepository = {
  list: async () => [],
  getById: async () => null,
  listLignes: async () => [],
  create: async () => null,
  update: async () => null,
  delete: async () => false,
  updateStatut: async () => null,
  listEnRetard: async () => [],
  recevoir: async () => null,
  setStatutFacturation: async () => null,
};

// Stub minimal du repo fournisseurs (composé par commandes pour getPerformances).
const stubFournisseurRepo = { list: async () => [] } as unknown as IFournisseurRepository;

describe("commandes.module", () => {
  it("createCommandesModule câble le repository injecté", () => {
    const module = createCommandesModule({ repository: stubRepo, fournisseurRepository: stubFournisseurRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "create",
      "delete",
      "getById",
      "list",
      "listEnRetard",
      "listLignes",
      "recevoir",
      "setStatutFacturation",
      "update",
      "updateStatut",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createCommandesModule({ repository: stubRepo, fournisseurRepository: stubFournisseurRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "create",
      "delete",
      "getById",
      "getEnRetard",
      "getLignes",
      "getPerformances",
      "list",
      "recevoir",
      "setStatutFacturation",
      "update",
      "updateStatut",
    ]);
  });
});

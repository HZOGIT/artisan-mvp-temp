import { describe, it, expect } from "vitest";
import { createFacturesModule } from "./factures.module";
import type { IFactureRepository } from "./application/facture-repository";
import type { IDevisReader } from "./application/devis-reader";

const stubReader: IDevisReader = {
  getDevis: async () => null,
  getLignes: async () => [],
};

const stubRepo: IFactureRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  setStatut: async () => null,
  enregistrerPaiement: async () => null,
  nextNumero: async () => "FAC-00001",
  nextNumeroAvoir: async () => "AV-00001",
  listAvoirs: async () => [],
  createAvoir: async () => null,
  ownsClient: async () => false,
  ownsDevis: async () => false,
  existsForDevis: async () => false,
  createFromDevis: async () => null,
  listLignes: async () => [],
  addLigne: async () => null,
  updateLigne: async () => null,
  deleteLigne: async () => false,
};

describe("factures.module", () => {
  it("createFacturesModule câble le repository injecté", () => {
    const module = createFacturesModule({ repository: stubRepo, devisReader: stubReader });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues (CRUD + statut + numéro + ownership + lignes)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "addLigne",
      "create",
      "createAvoir",
      "createFromDevis",
      "delete",
      "deleteLigne",
      "enregistrerPaiement",
      "existsForDevis",
      "getById",
      "list",
      "listAvoirs",
      "listLignes",
      "nextNumero",
      "nextNumeroAvoir",
      "ownsClient",
      "ownsDevis",
      "setStatut",
      "update",
      "updateLigne",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité CRUD + lignes + transitions)", () => {
    const module = createFacturesModule({ repository: stubRepo, devisReader: stubReader });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "addLigne",
      "convertirDepuisDevis",
      "create",
      "creerAvoir",
      "delete",
      "deleteLigne",
      "enregistrerPaiement",
      "envoyer",
      "getById",
      "getLignes",
      "list",
      "marquerEnRetard",
      "update",
      "updateLigne",
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { createDevisModule } from "./devis.module";
import type { IDevisRepository } from "./application/devis-repository";
import type { DevisMailingDeps } from "./application/envoyer-devis-email";

const stubMailing: DevisMailingDeps = {
  artisanReader: { getArtisan: async () => null },
  clientReader: { getClient: async () => null },
  pdf: { render: async () => Buffer.from("") },
  email: { send: async () => {} },
  rateLimiter: { check: async () => true },
};
const stubConverter = { convertir: async () => ({ id: 1, numero: "FAC-00001" }) };
const stubModeleRepo = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  addLigne: async () => null,
} as unknown as import("../modeles-devis/application/modele-devis-repository").IModeleDevisRepository;

const stubRepo: IDevisRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  setStatut: async () => null,
  nextNumero: async () => "DEV-00001",
  ownsClient: async () => false,
  listLignes: async () => [],
  addLigne: async () => null,
  updateLigne: async () => null,
  deleteLigne: async () => false,
};

describe("devis.module", () => {
  it("createDevisModule câble le repository injecté", () => {
    const module = createDevisModule({ repository: stubRepo, mailing: stubMailing, converter: stubConverter, modeleRepository: stubModeleRepo });
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
      "setStatut",
      "update",
      "updateLigne",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité CRUD + lignes + transitions)", () => {
    const module = createDevisModule({ repository: stubRepo, mailing: stubMailing, converter: stubConverter, modeleRepository: stubModeleRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "accepter",
      "addLigne",
      "addLigneToModele",
      "convertToFacture",
      "create",
      "createModele",
      "delete",
      "deleteLigne",
      "duplicate",
      "envoyer",
      "expirer",
      "getById",
      "getLignes",
      "getModeleWithLignes",
      "getModeles",
      "list",
      "refuser",
      "sendByEmail",
      "update",
      "updateLigne",
    ]);
  });
});

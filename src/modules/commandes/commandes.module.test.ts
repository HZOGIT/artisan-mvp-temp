import { describe, it, expect } from "vitest";
import { createCommandesModule } from "./commandes.module";
import type { ICommandeRepository } from "./application/commande-repository";
import type { IFournisseurRepository } from "../fournisseurs/application/fournisseur-repository";
import type { IDevisRepository } from "../devis/application/devis-repository";
import type { IClientRepository } from "../clients/application/client-repository";

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

// Stubs minimaux des repos composés par commandes (getPerformances + listDevisAcceptes).
const stubFournisseurRepo = { list: async () => [], getById: async () => null } as unknown as IFournisseurRepository;
const stubDevisRepo = { list: async () => [] } as unknown as IDevisRepository;
const stubClientRepo = { getById: async () => null } as unknown as IClientRepository;
// Stub des dépendances d'envoi email (sendEmail) — non exercées par ces tests de câblage.
const stubMailing = {
  repo: stubRepo,
  fournisseurRepo: stubFournisseurRepo,
  artisanReader: { getArtisan: async () => null },
  pdf: { render: async () => Buffer.from("") },
  email: { send: async () => {} },
  rateLimiter: { check: async () => true },
};

describe("commandes.module", () => {
  it("createCommandesModule câble le repository injecté", () => {
    const module = createCommandesModule({ repository: stubRepo, fournisseurRepository: stubFournisseurRepo, devisRepository: stubDevisRepo, clientRepository: stubClientRepo, mailing: stubMailing });
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
    const module = createCommandesModule({ repository: stubRepo, fournisseurRepository: stubFournisseurRepo, devisRepository: stubDevisRepo, clientRepository: stubClientRepo, mailing: stubMailing });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "create",
      "delete",
      "getById",
      "getEnRetard",
      "getLignes",
      "getPerformances",
      "list",
      "listDevisAcceptes",
      "recevoir",
      "sendEmail",
      "setStatutFacturation",
      "update",
      "updateStatut",
    ]);
  });
});

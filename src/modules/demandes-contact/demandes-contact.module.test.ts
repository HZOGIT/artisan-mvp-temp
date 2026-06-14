import { describe, it, expect } from "vitest";
import { createDemandesContactModule } from "./demandes-contact.module";
import type { IDemandeContactRepository } from "./application/demande-contact-repository";

const stubRepo: IDemandeContactRepository = {
  list: async () => [],
  listByStatut: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  setStatut: async () => null,
  delete: async () => false,
  ownsClient: async () => false,
};

describe("demandes-contact.module", () => {
  it("createDemandesContactModule câble le repository injecté", () => {
    const module = createDemandesContactModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose CRUD + listByStatut + setStatut + ownsClient (état machine + anti-IDOR)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "listByStatut", "ownsClient", "setStatut", "update"]);
  });

  it("expose un routeur tRPC assemblé (CRUD + byStatut ; transitions en 7/9)", () => {
    const module = createDemandesContactModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["byStatut", "create", "delete", "getById", "list", "update"]);
  });
});

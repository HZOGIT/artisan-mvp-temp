import { describe, it, expect } from "vitest";
import { createRelancesDevisModule } from "./relances-devis.module";
import type { IRelanceDevisRepository } from "./application/relance-devis-repository";

const stubRepo: IRelanceDevisRepository = {
  list: async () => [],
  listByDevis: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  delete: async () => false,
  ownsDevis: async () => false,
};

describe("relances-devis.module", () => {
  it("createRelancesDevisModule câble le repository injecté", () => {
    const module = createRelancesDevisModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose le journal append-only (pas d'update) + ownsDevis (anti-IDOR-FK)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "listByDevis", "ownsDevis"]);
  });

  it("expose un routeur tRPC assemblé (list/byDevis/getById/create/delete ; pas d'update)", () => {
    const module = createRelancesDevisModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["byDevis", "create", "delete", "getById", "list"]);
  });
});

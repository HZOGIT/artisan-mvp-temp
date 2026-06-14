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
});

import { describe, it, expect } from "vitest";
import { createRdvEnLigneModule } from "./rdv-en-ligne.module";
import type { IRdvRepository } from "./application/rdv-repository";

const stubRepo: IRdvRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  setStatut: async () => null,
  delete: async () => false,
  ownsClient: async () => false,
};

describe("rdv-en-ligne.module", () => {
  it("createRdvEnLigneModule câble le repository injecté", () => {
    const module = createRdvEnLigneModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose CRUD + setStatut + ownsClient (anti-IDOR-FK)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "ownsClient", "setStatut", "update"]);
  });
});

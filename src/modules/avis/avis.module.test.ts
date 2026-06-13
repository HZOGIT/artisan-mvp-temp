import { describe, it, expect } from "vitest";
import { createAvisModule } from "./avis.module";
import type { IAvisRepository } from "./application/avis-repository";

const stubRepo: IAvisRepository = {
  list: async () => [],
  getById: async () => null,
  getStats: async () => ({ moyenne: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }),
  repondre: async () => null,
  changerStatut: async () => null,
};

describe("avis.module (scaffold)", () => {
  it("createAvisModule câble le repository injecté", () => {
    const module = createAvisModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["changerStatut", "getById", "getStats", "list", "repondre"]);
  });
});

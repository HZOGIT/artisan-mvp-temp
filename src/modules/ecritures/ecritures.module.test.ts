import { describe, it, expect } from "vitest";
import { createEcrituresModule } from "./ecritures.module";
import type { IEcritureRepository } from "./application/ecriture-repository";

const stubRepo: IEcritureRepository = {
  list: async () => [],
  listByFacture: async () => [],
  createMany: async () => [],
  deleteByFacture: async () => 0,
  deleteByFactureJournal: async () => 0,
};

describe("ecritures.module", () => {
  it("createEcrituresModule câble le repository injecté", () => {
    const module = createEcrituresModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues (lecture + batch + idempotence)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["createMany", "deleteByFacture", "deleteByFactureJournal", "list", "listByFacture"]);
  });
});

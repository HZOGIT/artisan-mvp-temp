import { describe, it, expect } from "vitest";
import { createVehiculesModule } from "./vehicules.module";
import type { IVehiculeRepository } from "./application/vehicule-repository";

// Stub minimal : prouve que le port IVehiculeRepository est implémentable et que le
// module se câble. L'implémentation Drizzle réelle = étape 2 du gabarit.
const stubRepo: IVehiculeRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("not implemented");
  },
  update: async () => null,
  delete: async () => false,
  updateKilometrage: async () => null,
  listEntretiens: async () => [],
  addEntretien: async () => null,
  listAssurances: async () => [],
  addAssurance: async () => null,
};

describe("vehicules.module (scaffold)", () => {
  it("createVehiculesModule câble le repository injecté", () => {
    const module = createVehiculesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    const keys = Object.keys(stubRepo).sort();
    expect(keys).toEqual(
      [
        "addAssurance",
        "addEntretien",
        "create",
        "delete",
        "getById",
        "list",
        "listAssurances",
        "listEntretiens",
        "update",
        "updateKilometrage",
      ].sort(),
    );
  });
});

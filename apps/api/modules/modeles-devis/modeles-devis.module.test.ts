import { describe, it, expect } from "vitest";
import { createModelesDevisModule } from "./modeles-devis.module";
import type { IModeleDevisRepository } from "./application/modele-devis-repository";

const stubRepo: IModeleDevisRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  addLigne: async () => null,
};

describe("modeles-devis.module", () => {
  it("createModelesDevisModule câble le repository injecté", () => {
    const module = createModelesDevisModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose l'agrégat CRUD attendu (list léger / getById complet)", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["addLigne", "create", "delete", "getById", "list", "update"]);
  });

  it("expose un routeur tRPC assemblé (CRUD agrégat)", () => {
    const module = createModelesDevisModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["ajouterLigne", "create", "delete", "getById", "list", "update"]);
  });
});

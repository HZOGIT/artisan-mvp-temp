import { describe, it, expect } from "vitest";
import { createPrevisionsCAModule } from "./previsions-ca.module";
import type { IPrevisionCARepository } from "./application/prevision-ca-repository";
import type { PrevisionMethode } from "./domain/prevision-ca";

const stubRepo: IPrevisionCARepository = {
  list: async () => [],
  listByAnnee: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("previsions-ca.module", () => {
  it("createPrevisionsCAModule câble le repository injecté", () => {
    const module = createPrevisionsCAModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose le CRUD + listByAnnee attendus", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "listByAnnee", "update"]);
  });

  it("l'enum de méthode de calcul couvre les valeurs attendues", () => {
    const methodes: PrevisionMethode[] = ["moyenne_mobile", "regression_lineaire", "saisonnalite", "manuel"];
    expect(methodes).toHaveLength(4);
  });

  it("expose un routeur tRPC assemblé (CRUD + byAnnee)", () => {
    const module = createPrevisionsCAModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["byAnnee", "create", "delete", "getById", "list", "update"]);
  });
});

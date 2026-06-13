import { describe, it, expect } from "vitest";
import { createNotesDeFraisModule } from "./notes-de-frais.module";
import type { INoteDeFraisRepository } from "./application/note-de-frais-repository";

const stubRepo: INoteDeFraisRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("notes-de-frais.module", () => {
  it("createNotesDeFraisModule câble le repository injecté", () => {
    const module = createNotesDeFraisModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

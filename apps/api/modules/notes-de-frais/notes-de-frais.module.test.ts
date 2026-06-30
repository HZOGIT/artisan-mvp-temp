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
  setWorkflow: async () => null,
};

describe("notes-de-frais.module", () => {
  it("createNotesDeFraisModule câble le repository injecté", () => {
    const module = createNotesDeFraisModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "setWorkflow", "update"]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createNotesDeFraisModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "ajouterDepense",
      "approuver",
      "create",
      "delete",
      "getById",
      "list",
      "payer",
      "rejeter",
      "retirerDepense",
      "soumettre",
      "update",
    ]);
  });
});

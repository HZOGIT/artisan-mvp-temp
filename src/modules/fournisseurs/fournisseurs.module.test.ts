import { describe, it, expect } from "vitest";
import { createFournisseursModule } from "./fournisseurs.module";
import type { IFournisseurRepository } from "./application/fournisseur-repository";

const stubRepo: IFournisseurRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  listAssociationsArticle: async () => [],
  listAssociationsFournisseur: async () => [],
  ajouterAssociation: async () => null,
  supprimerAssociation: async () => false,
};

describe("fournisseurs.module", () => {
  it("createFournisseursModule câble le repository injecté", () => {
    const module = createFournisseursModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "ajouterAssociation",
      "create",
      "delete",
      "getById",
      "list",
      "listAssociationsArticle",
      "listAssociationsFournisseur",
      "supprimerAssociation",
      "update",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createFournisseursModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "associateArticle",
      "create",
      "delete",
      "dissociateArticle",
      "getArticleFournisseurs",
      "getById",
      "getFournisseurArticles",
      "list",
      "update",
    ]);
  });
});

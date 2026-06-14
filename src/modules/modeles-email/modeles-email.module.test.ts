import { describe, it, expect } from "vitest";
import { createModelesEmailModule } from "./modeles-email.module";
import { TYPES_MODELE_EMAIL } from "./domain/modele-email";
import type { IModeleEmailRepository } from "./application/modele-email-repository";

const stubRepo: IModeleEmailRepository = {
  list: async () => [],
  listByType: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("modeles-email.module", () => {
  it("createModelesEmailModule câble le repository injecté", () => {
    const module = createModelesEmailModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD + filtre type attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "listByType", "update"]);
  });

  it("l'enum des types de modèle est aligné sur le schéma (5 valeurs)", () => {
    expect(TYPES_MODELE_EMAIL).toEqual(["relance_devis", "envoi_devis", "envoi_facture", "rappel_paiement", "autre"]);
  });
});

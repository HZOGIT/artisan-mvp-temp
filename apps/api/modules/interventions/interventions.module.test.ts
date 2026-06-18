import { describe, it, expect } from "vitest";
import { createInterventionsModule } from "./interventions.module";
import type { IInterventionRepository } from "./application/intervention-repository";
import type { ICongeRepository } from "../conges/application/conge-repository";
import type { ITechnicienRepository } from "../techniciens/application/technicien-repository";

const stubCongeRepo = { list: async () => [] } as unknown as ICongeRepository;
const stubTechnicienRepo = { list: async () => [], getDernierePosition: async () => null } as unknown as ITechnicienRepository;

const stubRepo: IInterventionRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  ownsRef: async () => false,
  findTechnicienIdForUser: async () => null,
  listByTechnicien: async () => [],
  listJour: async () => [],
  listEquipe: async () => [],
  listEquipesArtisan: async () => [],
  addMembreEquipe: async () => {
    throw new Error("non implémenté (stub)");
  },
  removeMembreEquipe: async () => {},
  listCouleurs: async () => [],
  setCouleur: async () => {},
};

describe("interventions.module", () => {
  it("createInterventionsModule câble le repository injecté", () => {
    const module = createInterventionsModule({ repository: stubRepo, congeRepository: stubCongeRepo, technicienRepository: stubTechnicienRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "addMembreEquipe",
      "create",
      "delete",
      "findTechnicienIdForUser",
      "getById",
      "list",
      "listByTechnicien",
      "listCouleurs",
      "listEquipe",
      "listEquipesArtisan",
      "listJour",
      "ownsRef",
      "removeMembreEquipe",
      "setCouleur",
      "update",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createInterventionsModule({ repository: stubRepo, congeRepository: stubCongeRepo, technicienRepository: stubTechnicienRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "ajouterMembreEquipe",
      "assignerTechnicien",
      "create",
      "delete",
      "getById",
      "getCouleursCalendrier",
      "getEquipe",
      "getEquipesByArtisan",
      "getMine",
      "getSuggestionsTechniciens",
      "list",
      "retirerMembreEquipe",
      "setCouleurIntervention",
      "update",
    ]);
  });
});

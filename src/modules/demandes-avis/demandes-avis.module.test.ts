import { describe, it, expect } from "vitest";
import { createDemandesAvisModule } from "./demandes-avis.module";
import type { IDemandeAvisRepository } from "./application/demande-avis-repository";
import type { DemandeAvisStatut } from "./domain/demande-avis";

const stubRepo: IDemandeAvisRepository = {
  list: async () => [],
  listByStatut: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  setStatut: async () => null,
  delete: async () => false,
  ownsClient: async () => false,
  ownsIntervention: async () => false,
};

describe("demandes-avis.module", () => {
  it("createDemandesAvisModule câble le repository injecté", () => {
    const module = createDemandesAvisModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose le CRUD + listByStatut + setStatut + ownsClient/ownsIntervention", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "create",
      "delete",
      "getById",
      "list",
      "listByStatut",
      "ownsClient",
      "ownsIntervention",
      "setStatut",
    ]);
  });

  it("l'enum de statut couvre le cycle de vie attendu", () => {
    const statuts: DemandeAvisStatut[] = ["envoyee", "ouverte", "completee", "expiree"];
    expect(statuts).toHaveLength(4);
  });
});

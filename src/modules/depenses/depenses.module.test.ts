import { describe, it, expect } from "vitest";
import { createDepensesModule } from "./depenses.module";
import type { IDepenseRepository } from "./application/depense-repository";
import type { ICategorieDepenseRepository } from "../categories-depenses/application/categorie-depense-repository";
import type { IBudgetCategorieRepository } from "../budgets-categories/application/budget-categorie-repository";
import type { IRegleCategorisationRepository } from "../regles-categorisation/application/regle-categorisation-repository";
import type { INoteDeFraisRepository } from "../notes-de-frais/application/note-de-frais-repository";
import type { ITransactionBancaireRepository } from "./application/transaction-bancaire-repository";

const stubTransactionRepo: ITransactionBancaireRepository = {
  list: async () => [],
  getById: async () => null,
  ignorer: async () => {},
  createReleve: async () => ({ releveId: 0, nbImportees: 0 }),
  lierDepense: async () => {},
};

const stubRepo: IDepenseRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  ownsRef: async () => false,
  nextNumero: async () => "DEP-00001",
  realisesParCategorie: async () => [],
  findDoublons: async () => [],
  getStats: async () => ({
    mois: "2026-06", totalMois: 0, nbDepensesMois: 0, aRembourser: 0, tvaRecuperable: 0,
    totalMoisPrecedent: 0, variation: null, totalAnnee: 0, parCategorie: [], topDepenses: [], topFournisseurs: [], parMois: [],
  }),
};

const stubCategorieRepo: ICategorieDepenseRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

const stubBudgetRepo: IBudgetCategorieRepository = {
  list: async () => [],
  listByMois: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

const stubRegleRepo: IRegleCategorisationRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

const stubNoteRepo: INoteDeFraisRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  setWorkflow: async () => null,
  nextNumero: async () => "NDF-00001",
  addDepenseLink: async () => {},
  removeDepenseLink: async () => {},
};

describe("depenses.module", () => {
  it("createDepensesModule câble le repository injecté", () => {
    const module = createDepensesModule({ repository: stubRepo, categorieRepository: stubCategorieRepo, budgetRepository: stubBudgetRepo, regleRepository: stubRegleRepo, noteRepository: stubNoteRepo, transactionRepository: stubTransactionRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "findDoublons", "getById", "getStats", "list", "nextNumero", "ownsRef", "realisesParCategorie", "update"]);
  });

  it("expose les procédures de catégories (parité client trpc.depenses.*Categorie)", () => {
    const module = createDepensesModule({ repository: stubRepo, categorieRepository: stubCategorieRepo, budgetRepository: stubBudgetRepo, regleRepository: stubRegleRepo, noteRepository: stubNoteRepo, transactionRepository: stubTransactionRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record);
    expect(procedures).toEqual(expect.arrayContaining(["checkDoublons", "stats", "getCategories", "createCategorie", "updateCategorie", "deleteCategorie", "setBudget", "getBudgets", "getRegles", "createRegle", "deleteRegle", "listNotesFrais", "getNoteFraisById", "createNoteFrais", "soumettreNoteFrais", "approuverNoteFrais", "rejeterNoteFrais", "payerNoteFrais", "addDepenseToNoteFrais", "removeDepenseFromNoteFrais", "copierBudgetsMois", "creerIndemniteKm", "getTransactionsBancaires", "ignorerTransaction", "importReleve", "convertirTransaction"]));
  });
});

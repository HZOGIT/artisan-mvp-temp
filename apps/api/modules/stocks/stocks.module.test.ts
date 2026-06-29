import { describe, it, expect } from "vitest";
import { createStocksModule } from "./stocks.module";
import type { IStockRepository } from "./application/stock-repository";
import type { INotificationRepository } from "../notifications/application/notification-repository";
import type { IFournisseurRepository } from "../fournisseurs/application/fournisseur-repository";

const stubRepo: IStockRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  adjustQuantity: async () => ({ status: "not_found" }),
  listMouvements: async () => null,
  listLowStock: async () => [],
  listEnRupture: async () => [],
  listEntrant: async () => [],
};

// Stub minimal du repo notifications (composé par stocks pour generateAlerts).
const stubNotifRepo = {
  creer: async () => ({}) as never,
} as unknown as INotificationRepository;

// Stub minimal du repo fournisseurs (composé par stocks pour getRapportCommande).
const stubFournisseurRepo = {
  list: async () => [],
  listAssociationsArticle: async () => [],
} as unknown as IFournisseurRepository;

describe("stocks.module", () => {
  it("createStocksModule câble le repository injecté", () => {
    const module = createStocksModule({ repository: stubRepo, notificationRepository: stubNotifRepo, fournisseurRepository: stubFournisseurRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "adjustQuantity",
      "create",
      "delete",
      "getById",
      "list",
      "listEnRupture",
      "listEntrant",
      "listLowStock",
      "listMouvements",
      "update",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createStocksModule({ repository: stubRepo, notificationRepository: stubNotifRepo, fournisseurRepository: stubFournisseurRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "adjustQuantity",
      "create",
      "delete",
      "generateAlerts",
      "getById",
      "getEntrant",
      "getLowStock",
      "getMouvements",
      "getRapportCommande",
      "getStocksEnRupture",
      "inventaire",
      "list",
      "update",
    ]);
  });
});

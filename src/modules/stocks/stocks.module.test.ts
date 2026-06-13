import { describe, it, expect } from "vitest";
import { createStocksModule } from "./stocks.module";
import type { IStockRepository } from "./application/stock-repository";

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
};

describe("stocks.module", () => {
  it("createStocksModule câble le repository injecté", () => {
    const module = createStocksModule({ repository: stubRepo });
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
      "listLowStock",
      "listMouvements",
      "update",
    ]);
  });

  it("expose un routeur tRPC assemblé (procédures parité)", () => {
    const module = createStocksModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "adjustQuantity",
      "create",
      "delete",
      "getById",
      "getLowStock",
      "getMouvements",
      "getStocksEnRupture",
      "list",
      "update",
    ]);
  });
});

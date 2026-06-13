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
};

describe("stocks.module (scaffold)", () => {
  it("createStocksModule câble le repository injecté", () => {
    const module = createStocksModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

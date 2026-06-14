import { describe, it, expect } from "vitest";
import { createArticlesModule } from "./articles.module";
import type { IArticleRepository } from "./application/article-repository";

const stubRepo: IArticleRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
};

describe("articles.module", () => {
  it("createArticlesModule câble le repository injecté", () => {
    const module = createArticlesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations CRUD attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "update"]);
  });
});

import { describe, it, expect } from "vitest";
import { createArticlesModule } from "./articles.module";
import type { IArticleRepository } from "./application/article-repository";

const stubRepo: IArticleRepository = {
  list: async () => [],
  listByCategorie: async () => [],
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

  it("le port expose les opérations CRUD + filtre catégorie attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["create", "delete", "getById", "list", "listByCategorie", "update"]);
  });

  it("expose un routeur tRPC assemblé (CRUD + byCategorie + alias artisan-articles client)", () => {
    const module = createArticlesModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "byCategorie",
      "create",
      "createArtisanArticle",
      "delete",
      "deleteArtisanArticle",
      "getArtisanArticles",
      "getById",
      "list",
      "suggererArticlesIA",
      "update",
      "updateArtisanArticle",
    ]);
  });
});

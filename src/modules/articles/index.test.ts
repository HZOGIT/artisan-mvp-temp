import { describe, it, expect } from "vitest";
import * as articlesPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types/ports sont
// effacés à la compilation ; on vérifie surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite.
describe("articles — barrel (contrat public)", () => {
  it("expose le factory createArticlesModule", () => {
    expect(typeof articlesPublic.createArticlesModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("ArticleRepositoryDrizzle" in articlesPublic).toBe(false);
    expect("FakeArticleRepository" in articlesPublic).toBe(false);
  });
});

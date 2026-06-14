import { describe, it, expect } from "vitest";
import { FakeArticleRepository } from "../infra/article-repository-fake";
import { listArticles, getArticle } from "./read-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ reference: "ART-1", designation: "Tuyau", prixUnitaireHT: "12.50", ...over });

describe("articles — use-cases de lecture", () => {
  it("listArticles ne renvoie que les articles du tenant", async () => {
    const repo = new FakeArticleRepository();
    await repo.create(A, base({ designation: "Chez A" }));
    await repo.create(B, base({ designation: "Chez B" }));
    expect((await listArticles(repo, A)).map((a) => a.designation)).toEqual(["Chez A"]);
  });

  it("getArticle renvoie l'article du tenant propriétaire (+ défauts)", async () => {
    const repo = new FakeArticleRepository();
    const a = await repo.create(A, base());
    const got = await getArticle(repo, A, a.id);
    expect(got.designation).toBe("Tuyau");
    expect(got.unite).toBe("unité");
    expect(got.tauxTVA).toBe("20.00");
  });

  it("getArticle sur un article d'un autre tenant → NotFound (ne révèle pas l'existence)", async () => {
    const repo = new FakeArticleRepository();
    const a = await repo.create(A, base({ designation: "Secret" }));
    await expectCrossTenantDenied(() => getArticle(repo, B, a.id));
    await expect(getArticle(repo, B, a.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("getArticle sur un id inexistant → NotFound", async () => {
    const repo = new FakeArticleRepository();
    await expect(getArticle(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

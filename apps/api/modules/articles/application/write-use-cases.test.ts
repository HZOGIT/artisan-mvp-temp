import { describe, it, expect } from "vitest";
import { FakeArticleRepository } from "../infra/article-repository-fake";
import { creerArticle, modifierArticle, supprimerArticle } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ reference: "ART-1", designation: "Tuyau", prixUnitaireHT: "12.50", ...over });

describe("articles — use-cases d'écriture", () => {
  it("creerArticle OK + défauts ; scope au tenant", async () => {
    const repo = new FakeArticleRepository();
    const a = await creerArticle(repo, A, base({ categorie: "plomberie" }));
    expect(a.artisanId).toBe(1);
    expect(a.unite).toBe("unité");
    expect(a.tauxTVA).toBe("20.00");
    await creerArticle(repo, B, base({ designation: "Chez B" }));
    expect((await repo.list(A)).length).toBe(1);
  });

  it("creerArticle — reference/designation vides → Validation", async () => {
    const repo = new FakeArticleRepository();
    await expect(creerArticle(repo, A, base({ reference: "  " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerArticle(repo, A, base({ designation: "" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("creerArticle — prixUnitaireHT négatif → Validation ; tauxTVA hors [0,100] → Validation", async () => {
    const repo = new FakeArticleRepository();
    await expect(creerArticle(repo, A, base({ prixUnitaireHT: "-1" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerArticle(repo, A, base({ tauxTVA: "150" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("modifierArticle OK ; champ invalide → Validation ; cross-tenant → NotFound", async () => {
    const repo = new FakeArticleRepository();
    const a = await creerArticle(repo, A, base({ designation: "Avant" }));
    expect((await modifierArticle(repo, A, a.id, { designation: "Après" })).designation).toBe("Après");
    await expect(modifierArticle(repo, A, a.id, { prixUnitaireHT: "-5" })).rejects.toBeInstanceOf(ValidationError);
    await expectCrossTenantDenied(() => modifierArticle(repo, B, a.id, { designation: "hack" }));
    await expect(modifierArticle(repo, B, a.id, { designation: "hack" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("supprimerArticle OK ; inexistant/cross-tenant → NotFound", async () => {
    const repo = new FakeArticleRepository();
    const a = await creerArticle(repo, A, base());
    await supprimerArticle(repo, A, a.id);
    expect(await repo.list(A)).toEqual([]);
    await expect(supprimerArticle(repo, A, 999999)).rejects.toBeInstanceOf(NotFoundError);
    const a2 = await creerArticle(repo, A, base());
    await expectCrossTenantDenied(() => supprimerArticle(repo, B, a2.id));
  });
});

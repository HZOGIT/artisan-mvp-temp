import { describe, it, expect } from "vitest";
import { FakeArticleRepository } from "./infra/article-repository-fake";
import { creerArticle, modifierArticle, supprimerArticle } from "./application/write-use-cases";
import { getArticle, listArticles, articlesParCategorie } from "./application/read-use-cases";
import { NotFoundError, ValidationError } from "./../../shared/errors";
import type { TenantContext } from "../../shared/tenant";

// Revue de synthèse des invariants métier du domaine articles (catalogue).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const base = (over = {}) => ({ reference: "ART-1", designation: "Tuyau", prixUnitaireHT: "12.50", ...over });

describe("articles — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant — CRUD + listByCategorie d'un autre tenant → NotFound/[]", async () => {
    const repo = new FakeArticleRepository();
    const a = await creerArticle(repo, A, base({ categorie: "plomberie" }));
    await expect(getArticle(repo, B, a.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(modifierArticle(repo, B, a.id, { designation: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(supprimerArticle(repo, B, a.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listArticles(repo, B)).toEqual([]);
    expect(await articlesParCategorie(repo, B, "plomberie")).toEqual([]);
  });

  it("INV-2 : artisanId forcé — create scope toujours au tenant courant (jamais usurpable)", async () => {
    const repo = new FakeArticleRepository();
    const a = await creerArticle(repo, A, base());
    expect(a.artisanId).toBe(1);
  });

  it("INV-3 : validation — reference/designation non vides ; prix ≥ 0 ; tauxTVA ∈ [0,100]", async () => {
    const repo = new FakeArticleRepository();
    await expect(creerArticle(repo, A, base({ reference: " " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerArticle(repo, A, base({ designation: "" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerArticle(repo, A, base({ prixUnitaireHT: "-1" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(creerArticle(repo, A, base({ tauxTVA: "101" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("INV-4 : défauts PG — unite 'unité' / tauxTVA '20.00' quand absents", async () => {
    const repo = new FakeArticleRepository();
    const a = await creerArticle(repo, A, base());
    expect(a.unite).toBe("unité");
    expect(a.tauxTVA).toBe("20.00");
  });

  it("INV-5 : update partiel — les champs non fournis sont préservés", async () => {
    const repo = new FakeArticleRepository();
    const a = await creerArticle(repo, A, base({ designation: "Avant", categorie: "elec", prixUnitaireHT: "5.00" }));
    const maj = await modifierArticle(repo, A, a.id, { designation: "Après" });
    expect(maj.designation).toBe("Après");
    expect(maj.categorie).toBe("elec");
    expect(maj.prixUnitaireHT).toBe("5.00");
  });
});

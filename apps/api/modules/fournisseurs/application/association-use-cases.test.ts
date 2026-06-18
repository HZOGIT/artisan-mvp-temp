import { describe, it, expect, beforeEach } from "vitest";
import { FakeFournisseurRepository } from "../infra/fournisseur-repository-fake";
import {
  listerFournisseursDeArticle,
  listerArticlesDeFournisseur,
  associerArticleFournisseur,
  dissocierArticleFournisseur,
} from "./association-use-cases";
import { creerFournisseur } from "./write-use-cases";
import { expectCrossTenantDenied } from "../../../shared/testing";
import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("fournisseurs — associations article↔fournisseur (anti-IDOR prix d'achat)", () => {
  let repo: FakeFournisseurRepository;
  let fournA: number;
  let fournB: number;

  beforeEach(async () => {
    repo = new FakeFournisseurRepository();
    fournA = (await creerFournisseur(repo, A, { nom: "Point P" })).id;
    fournB = (await creerFournisseur(repo, B, { nom: "Cedeo" })).id;
    repo.seedArticle(100, 1); // article de A
    repo.seedArticle(200, 2); // article de B
  });

  it("associer + lister (par article / par fournisseur), scopé tenant", async () => {
    const assoc = await associerArticleFournisseur(repo, A, { articleId: 100, fournisseurId: fournA, prixAchat: "9.90" });
    expect(assoc.prixAchat).toBe("9.90");
    expect((await listerFournisseursDeArticle(repo, A, 100)).length).toBe(1);
    expect((await listerArticlesDeFournisseur(repo, A, fournA)).map((a) => a.articleId)).toEqual([100]);
  });

  it("anti-IDOR : associer avec un fournisseur d'un autre tenant → NotFound", async () => {
    await expect(associerArticleFournisseur(repo, A, { articleId: 100, fournisseurId: fournB })).rejects.toBeInstanceOf(NotFoundError);
    await expectCrossTenantDenied(() => associerArticleFournisseur(repo, A, { articleId: 100, fournisseurId: fournB }));
  });

  it("anti-IDOR : associer avec un article d'un autre tenant → NotFound", async () => {
    await expect(associerArticleFournisseur(repo, A, { articleId: 200, fournisseurId: fournA })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("anti-IDOR : B ne lit pas le prix d'achat d'un article de A → [] (sans oracle)", async () => {
    await associerArticleFournisseur(repo, A, { articleId: 100, fournisseurId: fournA, prixAchat: "9.90" });
    expect(await listerFournisseursDeArticle(repo, B, 100)).toEqual([]);
    expect(await listerArticlesDeFournisseur(repo, B, fournA)).toEqual([]);
  });

  it("dissocier OK pour le propriétaire / cross-tenant → NotFound", async () => {
    const assoc = await associerArticleFournisseur(repo, A, { articleId: 100, fournisseurId: fournA });
    await expect(dissocierArticleFournisseur(repo, B, assoc.id)).rejects.toBeInstanceOf(NotFoundError);
    await dissocierArticleFournisseur(repo, A, assoc.id);
    expect((await listerArticlesDeFournisseur(repo, A, fournA)).length).toBe(0);
    await expect(dissocierArticleFournisseur(repo, A, assoc.id)).rejects.toBeInstanceOf(NotFoundError); // déjà supprimé
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { FakeStockRepository } from "../infra/stock-repository-fake";
import { FakeFournisseurRepository } from "../../fournisseurs/infra/fournisseur-repository-fake";
import { genererRapportCommande } from "./rapport-use-cases";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("stocks — genererRapportCommande (réappro groupé par fournisseur, repos mockés)", () => {
  let stockRepo: FakeStockRepository;
  let fournisseurRepo: FakeFournisseurRepository;

  beforeEach(() => {
    stockRepo = new FakeStockRepository();
    fournisseurRepo = new FakeFournisseurRepository();
  });

  it("aucun stock bas → rapport vide", async () => {
    await stockRepo.create(A, { reference: "OK", designation: "Plein", quantiteEnStock: "100", seuilAlerte: "5" });
    expect(await genererRapportCommande(stockRepo, fournisseurRepo, A)).toEqual([]);
  });

  it("groupe par fournisseur, calcule quantiteACommander/prixUnitaire/montant et le total", async () => {
    // Stock bas lié à un article → fournisseur F (prixAchat association 10.00)
    const stock = await stockRepo.create(A, {
      reference: "BAS1",
      designation: "Tube",
      quantiteEnStock: "1",
      seuilAlerte: "5",
      prixAchat: "8.00",
      articleId: 100,
    });
    const f = await fournisseurRepo.create(A, { nom: "Fournisseur F" });
    fournisseurRepo.seedArticle(100, A.artisanId);
    await fournisseurRepo.ajouterAssociation(A, { articleId: 100, fournisseurId: f.id, prixAchat: "10.00", referenceExterne: "EXT-1", delaiLivraison: 3 });

    const rapport = await genererRapportCommande(stockRepo, fournisseurRepo, A);
    expect(rapport).toHaveLength(1);
    const groupe = rapport[0];
    expect(groupe.fournisseur?.id).toBe(f.id);
    expect(groupe.lignes).toHaveLength(1);
    const ligne = groupe.lignes[0];
    expect(ligne.stock.id).toBe(stock.id);
    // quantiteACommander = max(seuil*2 - qte, 1) = max(10 - 1, 1) = 9
    expect(ligne.quantiteACommander).toBe(9);
    // prixUnitaire = prixAchat de l'association (prioritaire sur le stock) = 10
    expect(ligne.prixUnitaire).toBe(10);
    expect(ligne.montantTotal).toBe(90);
    expect(ligne.articleFournisseur).toEqual({ referenceExterne: "EXT-1", prixAchat: "10.00", delaiLivraison: 3 });
    expect(groupe.totalCommande).toBe(90);
  });

  it("stock bas sans association → groupe 'sans fournisseur' (fournisseur null), prix du stock en repli", async () => {
    await stockRepo.create(A, {
      reference: "BAS2",
      designation: "Vis",
      quantiteEnStock: "0",
      seuilAlerte: "5",
      prixAchat: "2.50",
      articleId: 200, // aucun association déclarée
    });
    const rapport = await genererRapportCommande(stockRepo, fournisseurRepo, A);
    expect(rapport).toHaveLength(1);
    expect(rapport[0].fournisseur).toBeNull();
    const ligne = rapport[0].lignes[0];
    expect(ligne.quantiteACommander).toBe(10); // max(10 - 0, 1)
    expect(ligne.prixUnitaire).toBe(2.5); // repli sur stock.prixAchat
    expect(ligne.montantTotal).toBe(25);
    expect(ligne.articleFournisseur).toBeNull();
  });

  it("isolation : le rapport de B ne voit pas les stocks bas de A", async () => {
    await stockRepo.create(A, { reference: "BAS-A", designation: "A", quantiteEnStock: "0", seuilAlerte: "5" });
    expect(await genererRapportCommande(stockRepo, fournisseurRepo, B)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { compteTvaCollectee, COMPTE_CLIENT, COMPTE_VENTES, COMPTE_BANQUE } from "./comptes";

// Plan comptable minimal (PCG) des écritures de vente — PUR. Parité legacy `compteTvaCollectee` :
// ventilation du compte 4457xx par taux de TVA via des seuils DÉCROISSANTS (tolérants aux taux
// approchés), repli 445711.
describe("compteTvaCollectee", () => {
  it("taux standards français → compte 4457xx attendu", () => {
    expect(compteTvaCollectee(20).compte).toBe("445711");
    expect(compteTvaCollectee(10).compte).toBe("445712");
    expect(compteTvaCollectee(5.5).compte).toBe("445713");
    expect(compteTvaCollectee(2.1).compte).toBe("445714");
  });

  it("bornes inférieures incluses de chaque tranche", () => {
    expect(compteTvaCollectee(19.5).compte).toBe("445711");
    expect(compteTvaCollectee(9.5).compte).toBe("445712");
    expect(compteTvaCollectee(5).compte).toBe("445713");
    expect(compteTvaCollectee(2).compte).toBe("445714");
  });

  it("juste sous une borne → bascule dans la tranche du dessous", () => {
    expect(compteTvaCollectee(19.4).compte).toBe("445712");
    expect(compteTvaCollectee(9.4).compte).toBe("445713");
    expect(compteTvaCollectee(4.9).compte).toBe("445714");
  });

  it("taux nul / exonéré (< 2) → repli 445711", () => {
    expect(compteTvaCollectee(1.9).compte).toBe("445711");
    expect(compteTvaCollectee(0).compte).toBe("445711");
  });

  it("le libellé suit le compte (cohérence lib/compte)", () => {
    expect(compteTvaCollectee(20).lib).toBe("TVA collectée 20%");
    expect(compteTvaCollectee(10).lib).toBe("TVA collectée 10%");
    expect(compteTvaCollectee(0).lib).toBe("TVA collectée");
  });

  it("constantes du plan comptable (parité legacy)", () => {
    expect(COMPTE_CLIENT.compte).toBe("411000");
    expect(COMPTE_VENTES.compte).toBe("706000");
    expect(COMPTE_BANQUE.compte).toBe("512000");
  });
});

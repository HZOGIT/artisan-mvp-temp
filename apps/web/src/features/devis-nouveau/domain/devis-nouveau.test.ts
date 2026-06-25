import { describe, expect, it } from "vitest";
import { formatCurrency, totals, moveLine, ligneFromArticle, iaToLignes, iaTotals, buildAddLignePayload, buildModeleLignePayload, emptyLigne, type LigneDevis, type ArticleSearchResult, type IAProposition } from "./devis-nouveau";

const ligne = (over: Partial<LigneDevis> = {}): LigneDevis => ({ ...emptyLigne(), ...over });

describe("devis-nouveau — domain pur", () => {
  it("formatCurrency", () => { expect(formatCurrency("100")).toContain("€"); expect(formatCurrency(null)).toBe("0,00 €"); });
  it("totals : HT/TVA/TTC multi-lignes", () => {
    const t = totals([ligne({ quantite: 2, prixUnitaireHT: 100, tvaCategorieId: "FR_20" }), ligne({ quantite: 1, prixUnitaireHT: 50, tvaCategorieId: "FR_10" })]);
    expect(t.totalHT).toBe(250); expect(t.tva).toBe(45); expect(t.totalTTC).toBe(295);
  });
  it("moveLine : up/down + bornes", () => {
    const a = ligne({ id: "a" }), b = ligne({ id: "b" }), c = ligne({ id: "c" });
    expect(moveLine([a, b, c], 2, "up").map((l) => l.id)).toEqual(["a", "c", "b"]);
    expect(moveLine([a, b, c], 0, "up").map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(moveLine([a, b, c], 2, "down").map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
  it("ligneFromArticle : TVA article sinon courante", () => {
    const art = { nom: "Robinet", prixBase: "75", unite: "u", tauxTVA: "5.5" } as ArticleSearchResult;
    expect(ligneFromArticle(ligne({ tvaCategorieId: "FR_20" }), art)).toMatchObject({ description: "Robinet", prixUnitaireHT: 75, tvaCategorieId: "FR_5_5" });
    expect(ligneFromArticle(ligne({ tvaCategorieId: "FR_20" }), { ...art, tauxTVA: null }).tvaCategorieId).toBe("FR_20");
  });
  it("iaToLignes + iaTotals", () => {
    const prop = { objet: "x", dureeEstimee: null, notes: null, conseilsArtisan: null, lignes: [{ designation: "D", quantite: 2, unite: "u", prixUnitaire: 100, tauxTva: 20, type: "produit" }] } as unknown as IAProposition;
    expect(iaToLignes(prop)).toHaveLength(1);
    expect(iaToLignes(prop)[0]).toMatchObject({ description: "D", quantite: 2, prixUnitaireHT: 100, tvaCategorieId: "FR_20" });
    expect(iaTotals(prop.lignes)).toEqual({ ht: 200, ttc: 240 });
  });
  it("buildAddLignePayload / buildModeleLignePayload", () => {
    expect(buildAddLignePayload(7, ligne({ description: "L", quantite: 3, prixUnitaireHT: 10, tvaCategorieId: "FR_20" }))).toEqual({ devisId: 7, designation: "L", quantite: "3", prixUnitaireHT: "10", tvaCategorieId: "FR_20" });
    expect(buildModeleLignePayload(5, ligne({ description: "L", quantite: 3, prixUnitaireHT: 10, tvaCategorieId: "FR_20", unite: "u" }))).toEqual({ modeleId: 5, designation: "L", quantite: 3, prixUnitaireHT: 10, tauxTVA: 20, unite: "u" });
  });
});

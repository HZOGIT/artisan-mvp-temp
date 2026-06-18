import { describe, expect, it } from "vitest";
import { formatCurrency, lineTotals, filterArticles, groupByCategorie, buildAddLignePayload, articlePrix, articleRef, defaultLigneForm, type BiblioArticle } from "./devis-ligne";

const art = (over: Partial<BiblioArticle> = {}): BiblioArticle => ({ id: 1, metier: "m", categorie: "Plomberie", sousCategorie: "REF1", nom: "Robinet", description: null, prixBase: "50", unite: "u", tauxTVA: "10", prixRevient: null, dureeMoyenneMinutes: null, visible: true, ...over } as BiblioArticle);

describe("devis-ligne — domain pur", () => {
  it("formatCurrency : tolérant", () => {
    expect(formatCurrency("50")).toContain("€");
    expect(formatCurrency(null)).toBe("0,00 €");
    expect(formatCurrency("abc")).toBe("0,00 €");
  });
  it("articlePrix/articleRef : camelCase (corrige le snake_case legacy)", () => {
    expect(articlePrix(art({ prixBase: "99" }))).toBe("99");
    expect(articleRef(art({ sousCategorie: "SC" }))).toBe("SC");
  });
  it("lineTotals : HT/TVA/TTC", () => {
    expect(lineTotals({ ...defaultLigneForm(), quantite: "2", prixUnitaireHT: "100", tauxTVA: "20" })).toMatchObject({ totalHT: 200, totalTVA: 40, totalTTC: 240 });
  });
  it("filterArticles : recherche + limite 100", () => {
    const ms = (v: string | null | undefined, q: string) => (v || "").toLowerCase().includes(q.toLowerCase());
    expect(filterArticles([art({ nom: "Robinet" }), art({ id: 2, nom: "Tuyau" })], "robi", ms)).toHaveLength(1);
    expect(filterArticles([art(), art({ id: 2 })], "", ms)).toHaveLength(2);
  });
  it("groupByCategorie", () => {
    const g = groupByCategorie([art({ categorie: "A" }), art({ id: 2, categorie: "A" }), art({ id: 3, categorie: "B" })]);
    expect(g.A).toHaveLength(2); expect(g.B).toHaveLength(1);
  });
  it("buildAddLignePayload : section → prix 0 + type, produit → champs complets", () => {
    const f = { ...defaultLigneForm(), designation: "Lot", prixUnitaireHT: "100", quantite: "3" };
    expect(buildAddLignePayload(5, f, "section")).toEqual({ devisId: 5, designation: "Lot", prixUnitaireHT: "0", type: "section" });
    expect(buildAddLignePayload(5, f, "produit")).toMatchObject({ devisId: 5, designation: "Lot", prixUnitaireHT: "100", quantite: "3", type: "produit" });
  });
});

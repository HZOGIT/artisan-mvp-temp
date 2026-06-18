import { describe, it, expect } from "vitest";
import { genererLignesDevis, type Suggestion } from "./devis-ia";

const sugg = (id: number, over: Partial<Suggestion> = {}): Suggestion => ({ id, resultatId: 1, articleId: null, nomArticle: `Article ${id}`, description: null, quantiteSuggeree: "2", unite: "u", prixEstime: "100", confiance: "0.9", selectionne: true, createdAt: new Date(), ...over });

describe("genererLignesDevis", () => {
  it("ne garde que les suggestions sélectionnées ; totaux dérivés (TVA 20%)", () => {
    const r = genererLignesDevis([sugg(1), sugg(2, { selectionne: false }), sugg(3, { quantiteSuggeree: "1", prixEstime: "50" })]);
    expect(r).not.toBeNull();
    expect(r!.lignes).toHaveLength(2); // 1 et 3 (2 non sélectionnée)
    // ligne 1 : 2 × 100 = 200 HT ; ligne 3 : 1 × 50 = 50 HT → total HT 250
    expect(r!.totalHT).toBe(250);
    expect(r!.totalTVA).toBe(50); // 20%
    expect(r!.totalTTC).toBe(300);
    expect(r!.lignes[0].montantTTC).toBe(240); // 200 + 40
    expect(r!.lignes.map((l) => l.ordre)).toEqual([0, 1]);
  });
  it("filtre par suggestionIds si fourni", () => {
    const r = genererLignesDevis([sugg(1), sugg(2)], [2]);
    expect(r!.lignes).toHaveLength(1);
    expect(r!.lignes[0].designation).toBe("Article 2");
  });
  it("aucune suggestion sélectionnée → null", () => {
    expect(genererLignesDevis([sugg(1, { selectionne: false })])).toBeNull();
    expect(genererLignesDevis([])).toBeNull();
  });
  it("quantité/prix vides → défauts (1 / 0)", () => {
    const r = genererLignesDevis([sugg(1, { quantiteSuggeree: null, prixEstime: null })]);
    expect(r!.lignes[0].quantite).toBe(1);
    expect(r!.lignes[0].prixUnitaireHT).toBe(0);
  });
});

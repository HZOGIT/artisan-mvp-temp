import { describe, expect, it } from "vitest";
import { totals, mapArtisanArticles, mapBiblioResults, ligneFromSearchResult, mapIaLignes, validateForm, buildCreatePayload, buildUpdatePayload, emptyLigne, type ArtisanArticle, type BiblioArticle, type IAProposition, type LigneCommande, type SearchResult, type CommandeForm } from "./commande-form";

const ligne = (over: Partial<LigneCommande> = {}): LigneCommande => ({ ...emptyLigne(), ...over });

describe("commande-form — domain pur", () => {
  it("totals", () => {
    expect(totals([ligne({ quantite: 2, prixUnitaire: 100, tauxTVA: 20 })])).toEqual({ totalHT: 200, totalTVA: 40, totalTTC: 240 });
  });
  it("mapArtisanArticles : recherche + pas de prixAchat (quirk)", () => {
    const arts = [{ id: 1, designation: "Robinet", reference: "R1", unite: "u", prixUnitaireHT: "50", tauxTVA: "20" }] as unknown as ArtisanArticle[];
    const ms = (v: string | null | undefined, q: string) => (v || "").toLowerCase().includes(q.toLowerCase());
    const r = mapArtisanArticles(arts, "robi", ms);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: "artisan", nom: "Robinet", prixAchat: undefined, prixVente: 50 });
  });
  it("mapBiblioResults : id préfixé biblio-", () => {
    const data = [{ id: 7, nom: "Tube", unite: "ml", prixBase: "12" }] as BiblioArticle[];
    expect(mapBiblioResults(data)[0]).toMatchObject({ id: "biblio-7", type: "bibliotheque", nom: "Tube", prixVente: 12 });
  });
  it("ligneFromSearchResult : articleId si artisan, prix d'achat seulement", () => {
    const art = { id: 5, type: "artisan", nom: "X", reference: "R", unite: "u", prixAchat: 30, prixVente: 99 } as SearchResult;
    expect(ligneFromSearchResult(ligne(), art)).toMatchObject({ articleId: 5, designation: "X", prixUnitaire: 30 });
    const biblio = { id: "biblio-9", type: "bibliotheque", nom: "Y", reference: "", unite: "u", prixAchat: undefined } as SearchResult;
    expect(ligneFromSearchResult(ligne(), biblio)).toMatchObject({ articleId: null, prixUnitaire: undefined });
  });
  it("mapIaLignes", () => {
    const prop = { devisNumero: "D1", notes: "n", lignes: [{ articleId: 3, designation: "A", reference: "R", quantite: 2, unite: "u", prixUnitaire: 10, tauxTVA: 20 }] } as unknown as IAProposition;
    expect(mapIaLignes(prop)[0]).toMatchObject({ articleId: 3, designation: "A", quantite: 2, prixUnitaire: 10, tauxTVA: 20 });
  });
  it("validateForm", () => {
    expect(validateForm(0, [ligne()])).toBe("errFournisseur");
    expect(validateForm(5, [])).toBe("errAucuneLigne");
    expect(validateForm(5, [ligne({ designation: "" })])).toBe("errDesignation");
    expect(validateForm(5, [ligne({ designation: "X" })])).toBeNull();
  });
  it("buildCreatePayload / buildUpdatePayload (métadonnées seules)", () => {
    const form: CommandeForm = { fournisseurId: 5, dateLivraisonPrevue: "2026-06-20", adresseLivraison: "", notes: "N" };
    const cp = buildCreatePayload(form, [ligne({ designation: "L", quantite: 2, prixUnitaire: 10, tauxTVA: 20 })]);
    expect(cp.fournisseurId).toBe(5); expect(cp.lignes).toHaveLength(1); expect(cp.notes).toBe("N");
    expect(cp.dateLivraisonPrevue).toContain("2026-06-20");
    const up = buildUpdatePayload(7, form);
    expect(up).not.toHaveProperty("fournisseurId"); expect(up).not.toHaveProperty("lignes");
    expect(up.id).toBe(7); expect(up.notes).toBe("N");
  });
});

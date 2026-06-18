import { describe, expect, it } from "vitest";
import { formatCurrency, allowedNext, avoirSolde, avoirLignesMontantTTC, buildAvoirTotalLignes, statutAction, activitesForFacture, pendingCount, type Avoir, type Ligne, type Activite, type AvoirLigneForm } from "./facture-detail";

describe("facture-detail — domain pur", () => {
  it("formatCurrency", () => { expect(formatCurrency("100")).toContain("€"); expect(formatCurrency(null)).toContain("0"); });
  it("allowedNext : matrice de transitions", () => {
    expect(allowedNext("brouillon")).toEqual(["envoyee"]);
    expect(allowedNext("envoyee")).toEqual(["payee", "en_retard"]);
    expect(allowedNext("payee")).toEqual([]);
  });
  it("statutAction", () => {
    expect(statutAction("envoyee")).toBe("envoyer");
    expect(statutAction("en_retard")).toBe("marquerEnRetard");
    expect(statutAction("payee")).toBe("payer");
    expect(statutAction("brouillon")).toBeNull();
  });
  it("avoirSolde : couverture/solde/blocage", () => {
    const facTTC = 1000;
    expect(avoirSolde([], facTTC)).toMatchObject({ totalCouvert: 0, soldeRestant: 1000, bloque: false });
    const total = [{ numero: "AV1", totalTTC: "-1000" }] as unknown as Avoir[];
    const s = avoirSolde(total, facTTC);
    expect(s.bloque).toBe(true); expect(s.avoirTotalExistant?.numero).toBe("AV1"); expect(s.soldeRestant).toBe(0);
    const partiel = avoirSolde([{ numero: "AV2", totalTTC: "-400" }] as unknown as Avoir[], facTTC);
    expect(partiel.soldeRestant).toBe(600); expect(partiel.bloque).toBe(false);
  });
  it("avoirLignesMontantTTC : valeurs absolues + TVA", () => {
    const l = [{ designation: "x", quantite: "2", prixUnitaireHT: "100", tauxTVA: "20", unite: "u" }] as AvoirLigneForm[];
    expect(avoirLignesMontantTTC(l)).toBe(240);
  });
  it("buildAvoirTotalLignes : exclut section/note", () => {
    const lignes = [{ designation: "P", quantite: "1", prixUnitaireHT: "100", tauxTVA: "20", unite: "u", type: "produit" }, { designation: "S", type: "section" }] as unknown as Ligne[];
    const r = buildAvoirTotalLignes(lignes);
    expect(r).toHaveLength(1); expect(r[0].designation).toBe("P");
  });
  it("activitesForFacture + pendingCount", () => {
    const list = [{ id: 1, entiteType: "facture", entiteId: 5, fait: false, echeance: "2026-06-25" }, { id: 2, entiteType: "devis", entiteId: 5, fait: false, echeance: "2026-06-20" }, { id: 3, entiteType: "facture", entiteId: 5, fait: true, echeance: "2026-06-20" }] as unknown as Activite[];
    const r = activitesForFacture(list, 5);
    expect(r.map((a) => a.id)).toEqual([3, 1]);
    expect(pendingCount(r)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { formatCurrency, activitesForDevis, pendingCount, pdfLignes, statutTransition, type Activite, type Ligne } from "./devis-detail";

const act = (over: Partial<Activite>): Activite => ({ id: 1, entiteType: "devis", entiteId: 5, fait: false, titre: "T", echeance: "2026-06-20", type: "relance", ...over } as unknown as Activite);

describe("devis-detail — domain pur", () => {
  it("formatCurrency", () => { expect(formatCurrency("100")).toContain("€"); expect(formatCurrency(null)).toContain("0"); });
  it("statutTransition", () => {
    expect(statutTransition("envoye")).toBe("envoyer");
    expect(statutTransition("accepte")).toBe("accepter");
    expect(statutTransition("refuse")).toBe("refuser");
    expect(statutTransition("brouillon")).toBeNull();
  });
  it("activitesForDevis : filtre entité + tri par échéance", () => {
    const list = [act({ id: 1, entiteId: 5, echeance: "2026-06-25" }), act({ id: 2, entiteId: 9, echeance: "2026-06-21" }), act({ id: 3, entiteId: 5, echeance: "2026-06-20" })];
    const r = activitesForDevis(list, 5);
    expect(r.map((a) => a.id)).toEqual([3, 1]); // entiteId 5 seulement, trié par échéance
  });
  it("pendingCount : non faits", () => {
    expect(pendingCount([act({ fait: false }), act({ fait: true }), act({ fait: false })])).toBe(2);
  });
  it("pdfLignes : mappe quantité/prix/tva + type", () => {
    const lignes = [{ designation: "D", description: null, quantite: "2", prixUnitaireHT: "100", tauxTVA: "20", unite: "u", type: "produit" }] as unknown as Ligne[];
    expect(pdfLignes(lignes)[0]).toMatchObject({ designation: "D", quantite: 2, prixUnitaire: 100, tauxTva: 20, type: "produit" });
  });
});

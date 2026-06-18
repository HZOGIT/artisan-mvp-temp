import { describe, expect, it } from "vitest";
import { formatCurrency, ligneTotal, receptionActive, estRecue, aDesQuantitesRecues, buildReceptionPayload, findFournisseur, depenseLabel, NEXT_STATUSES, type Ligne, type Fournisseur, type Depense } from "./commande-detail";

const ligne = (over: Record<string, unknown> = {}): Ligne => ({ id: 1, designation: "X", quantite: "2", prixUnitaire: "50", tauxTVA: "20", quantiteRecue: "0", unite: "u", reference: null, ...over } as unknown as Ligne);

describe("commande-detail — domain pur", () => {
  it("formatCurrency : tolérant string/null", () => {
    expect(formatCurrency("100")).toContain("€");
    expect(formatCurrency(null)).toContain("0");
  });

  it("ligneTotal : quantité × PU", () => {
    expect(ligneTotal(ligne({ quantite: "3", prixUnitaire: "10" }))).toBe(30);
  });

  it("receptionActive / estRecue / aDesQuantitesRecues", () => {
    expect(receptionActive("envoyee")).toBe(true);
    expect(receptionActive("brouillon")).toBe(false);
    expect(estRecue("livree")).toBe(true);
    expect(aDesQuantitesRecues([ligne({ quantiteRecue: "0" }), ligne({ quantiteRecue: "3" })])).toBe(true);
    expect(aDesQuantitesRecues([ligne({ quantiteRecue: "0" })])).toBe(false);
  });

  it("buildReceptionPayload : valeur saisie sinon quantité déjà reçue", () => {
    const lignes = [ligne({ id: 1, quantiteRecue: "0" }), ligne({ id: 2, quantiteRecue: "5" })];
    const payload = buildReceptionPayload(lignes, { 1: "3" });
    expect(payload).toEqual([{ ligneId: 1, quantiteRecue: 3 }, { ligneId: 2, quantiteRecue: 5 }]);
  });

  it("findFournisseur / depenseLabel / NEXT_STATUSES", () => {
    const f = [{ id: 7, nom: "ACME" }] as unknown as Fournisseur[];
    expect(findFournisseur(f, 7)?.nom).toBe("ACME");
    expect(findFournisseur(f, null)).toBeUndefined();
    expect(depenseLabel({ id: 3, fournisseur: null, description: null } as unknown as Depense)).toBe("Dépense #3");
    expect(NEXT_STATUSES.brouillon).toEqual(["envoyee", "annulee"]);
  });
});

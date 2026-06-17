import { describe, expect, it } from "vitest";
import { filterCommandes, isCommandeStatut, STATUT_KEYS, type Commande } from "./commande";

const mk = (p: Partial<Commande> & { id: number }): Commande =>
  ({ numero: `C-${p.id}`, reference: "", statut: "brouillon", fournisseurId: null, ...p } as unknown as Commande);

const noName = () => "";

describe("isCommandeStatut", () => {
  it("reconnaît les statuts gérés", () => {
    expect(STATUT_KEYS).toContain("livree");
    expect(isCommandeStatut("envoyee")).toBe(true);
    expect(isCommandeStatut("tous")).toBe(false);
    expect(isCommandeStatut("xxx")).toBe(false);
  });
});

describe("filterCommandes", () => {
  const list = [
    mk({ id: 1, statut: "brouillon", fournisseurId: 5, numero: "BC-001" }),
    mk({ id: 2, statut: "envoyee", fournisseurId: 9, numero: "BC-002", reference: "REF-X" }),
    mk({ id: 3, statut: "livree", fournisseurId: 5, numero: "BC-003" }),
  ];

  it("filtre par statut", () => {
    expect(
      filterCommandes(list, { filterStatut: "livree", filterFournisseur: "tous", searchQuery: "", resolveFournisseurNom: noName }).map((c) => c.id),
    ).toEqual([3]);
  });

  it("filtre par fournisseur (id en string)", () => {
    expect(
      filterCommandes(list, { filterStatut: "tous", filterFournisseur: "5", searchQuery: "", resolveFournisseurNom: noName }).map((c) => c.id),
    ).toEqual([1, 3]);
  });

  it("recherche numéro / référence / nom fournisseur (via résolveur)", () => {
    expect(
      filterCommandes(list, { filterStatut: "tous", filterFournisseur: "tous", searchQuery: "REF-X", resolveFournisseurNom: noName }).map((c) => c.id),
    ).toEqual([2]);
    expect(
      filterCommandes(list, {
        filterStatut: "tous",
        filterFournisseur: "tous",
        searchQuery: "Acme",
        resolveFournisseurNom: (id) => (id === 9 ? "Acme SARL" : ""),
      }).map((c) => c.id),
    ).toEqual([2]);
  });

  it("combine statut + fournisseur", () => {
    expect(
      filterCommandes(list, { filterStatut: "brouillon", filterFournisseur: "5", searchQuery: "", resolveFournisseurNom: noName }).map((c) => c.id),
    ).toEqual([1]);
  });
});

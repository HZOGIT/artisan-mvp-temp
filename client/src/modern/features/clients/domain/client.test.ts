import { describe, expect, it } from "vitest";
import { nomComplet } from "./client";

// Règle de domaine PURE (sans réseau) : libellé d'affichage d'un client.
describe("nomComplet", () => {
  it("privilégie la raison sociale si présente", () => {
    expect(nomComplet({ nom: "Dupont", prenom: "Jean", raisonSociale: "ACME SARL" })).toBe("ACME SARL");
  });

  it("compose prénom + nom pour un particulier", () => {
    expect(nomComplet({ nom: "Dupont", prenom: "Jean", raisonSociale: null })).toBe("Jean Dupont");
  });

  it("tolère un prénom absent", () => {
    expect(nomComplet({ nom: "Dupont", prenom: null, raisonSociale: null })).toBe("Dupont");
  });

  it("retombe sur le nom si la composition est vide", () => {
    expect(nomComplet({ nom: "Dupont", prenom: "", raisonSociale: "" })).toBe("Dupont");
  });
});

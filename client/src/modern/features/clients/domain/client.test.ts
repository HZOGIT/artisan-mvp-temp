import { describe, expect, it } from "vitest";
import { nomComplet, findDuplicateGroups, findCreateDuplicateMatch, type Client } from "./client";

// Fabrique de Client minimal pour les tests purs (les champs non utilisés sont remplis loosely).
const mk = (p: Partial<Client> & { id: number }): Client => ({
  nom: "", prenom: "", email: "", telephone: "", ville: "", raisonSociale: null,
  ...p,
} as unknown as Client);

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

describe("findDuplicateGroups", () => {
  it("groupe par même email (normalisé)", () => {
    const groups = findDuplicateGroups([
      mk({ id: 1, nom: "A", email: "  X@MAIL.com " }),
      mk({ id: 2, nom: "B", email: "x@mail.com" }),
      mk({ id: 3, nom: "C", email: "autre@mail.com" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasonKey).toBe("dupesSameEmail");
    expect(groups[0].reasonParams?.email).toBe("x@mail.com");
    expect(groups[0].clients.map((c) => c.id)).toEqual([1, 2]);
  });

  it("groupe par même prénom+nom", () => {
    const groups = findDuplicateGroups([
      mk({ id: 1, nom: "Dupont", prenom: "Jean" }),
      mk({ id: 2, nom: "dupont", prenom: " jean " }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasonKey).toBe("dupesSameName");
  });

  it("ne signale rien sans doublon", () => {
    expect(findDuplicateGroups([mk({ id: 1, nom: "A", email: "a@x.fr" })])).toEqual([]);
  });
});

describe("findCreateDuplicateMatch", () => {
  const base = [mk({ id: 9, nom: "Martin", prenom: "Léa", email: "lea@x.fr", telephone: "0612345678" })];

  it("détecte par email", () => {
    const m = findCreateDuplicateMatch({ email: "LEA@x.fr", telephone: "", prenom: "", nom: "" }, base);
    expect(m?.reasonKey).toBe("dupeReasonEmail");
  });
  it("détecte par téléphone (>= 6 chiffres)", () => {
    const m = findCreateDuplicateMatch({ email: "", telephone: "06 12 34 56 78", prenom: "", nom: "" }, base);
    expect(m?.reasonKey).toBe("dupeReasonPhone");
  });
  it("détecte par nom", () => {
    const m = findCreateDuplicateMatch({ email: "", telephone: "", prenom: "Léa", nom: "Martin" }, base);
    expect(m?.reasonKey).toBe("dupeReasonName");
  });
  it("renvoie null si aucun match", () => {
    expect(findCreateDuplicateMatch({ email: "x@y.fr", telephone: "", prenom: "", nom: "" }, base)).toBeNull();
  });
});

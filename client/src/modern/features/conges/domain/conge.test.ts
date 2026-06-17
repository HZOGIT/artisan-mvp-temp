import { describe, expect, it } from "vitest";
import { calculerJours, technicienNom, filterByStatut, TYPES_CONGE, STATUTS, type Conge, type Technicien } from "./conge";

const tech = (p: Partial<Technicien> & { id: number }): Technicien =>
  ({ prenom: null, nom: null, ...p } as unknown as Technicien);
const conge = (p: Partial<Conge> & { id: number }): Conge =>
  ({ technicienId: 1, type: "rtt", statut: "en_attente", dateDebut: "2026-01-01", dateFin: "2026-01-01", motif: null, commentaireValidation: null, ...p } as unknown as Conge);

describe("constantes", () => {
  it("expose les types et statuts canoniques", () => {
    expect(TYPES_CONGE).toContain("conge_paye");
    expect(STATUTS).toEqual(["en_attente", "approuve", "refuse", "annule"]);
  });
});

describe("calculerJours", () => {
  it("compte INCLUSIVEMENT (même jour = 1)", () => {
    expect(calculerJours("2026-06-10", "2026-06-10")).toBe(1);
    expect(calculerJours("2026-06-10", "2026-06-12")).toBe(3);
  });
  it("est indifférent à l'ordre (valeur absolue)", () => {
    expect(calculerJours("2026-06-12", "2026-06-10")).toBe(3);
  });
  it("dates invalides → 0 (ne jette pas)", () => {
    expect(calculerJours("", "2026-06-10")).toBe(0);
    expect(calculerJours("pas-une-date", "x")).toBe(0);
  });
});

describe("technicienNom", () => {
  const techs = [tech({ id: 1, prenom: "Jean", nom: "Dupont" }), tech({ id: 2, prenom: "Marie", nom: null })];
  it("renvoie « prénom nom » nettoyé", () => {
    expect(technicienNom(techs, 1)).toBe("Jean Dupont");
    expect(technicienNom(techs, 2)).toBe("Marie");
  });
  it("renvoie null si introuvable (l'UI substitue le fallback)", () => {
    expect(technicienNom(techs, 99)).toBeNull();
  });
});

describe("filterByStatut", () => {
  const list = [conge({ id: 1, statut: "approuve" }), conge({ id: 2, statut: "refuse" }), conge({ id: 3, statut: "approuve" })];
  it("ne garde que le statut demandé", () => {
    expect(filterByStatut(list, "approuve").map((c) => c.id)).toEqual([1, 3]);
    expect(filterByStatut(list, "refuse").map((c) => c.id)).toEqual([2]);
    expect(filterByStatut(list, "annule")).toEqual([]);
  });
});

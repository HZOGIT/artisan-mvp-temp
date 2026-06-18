import { describe, expect, it } from "vitest";
import {
  clientNom, computeStats, filterContrats, statutVariant, PERIODICITE_MULT,
  type Contrat, type Client,
} from "./contrat";

const contrat = (p: Partial<Contrat> & { id: number }): Contrat =>
  ({ clientId: 1, reference: "CTR-00001", titre: "Entretien", type: "entretien", montantHT: "100.00", tauxTVA: "20.00", periodicite: "annuel", statut: "actif", prochainFacturation: null, ...p } as unknown as Contrat);
const client = (p: Partial<Client> & { id: number }): Client =>
  ({ nom: null, prenom: null, ...p } as unknown as Client);

describe("clientNom", () => {
  const clients = [client({ id: 1, nom: "Dupont", prenom: "Jean" }), client({ id: 2, nom: "Martin", prenom: null })];
  it("résout « nom prénom » via clientId", () => {
    expect(clientNom(clients, 1)).toBe("Dupont Jean");
    expect(clientNom(clients, 2)).toBe("Martin");
  });
  it("renvoie '' si client introuvable", () => {
    expect(clientNom(clients, 99)).toBe("");
  });
});

describe("computeStats", () => {
  it("compte total/actifs et annualise le CA selon la périodicité", () => {
    const list = [
      contrat({ id: 1, statut: "actif", montantHT: "100.00", periodicite: "mensuel" }), // 1200
      contrat({ id: 2, statut: "actif", montantHT: "300.00", periodicite: "annuel" }), //  300
      contrat({ id: 3, statut: "suspendu", montantHT: "999.00", periodicite: "mensuel" }), // ignoré
    ];
    const s = computeStats(list);
    expect(s.total).toBe(3);
    expect(s.actifs).toBe(2);
    expect(s.caAnnuel).toBeCloseTo(1500);
  });
  it("multiplicateurs canoniques", () => {
    expect(PERIODICITE_MULT).toEqual({ mensuel: 12, trimestriel: 4, semestriel: 2, annuel: 1 });
  });
  it("montant invalide → 0 (ne casse pas la somme)", () => {
    expect(computeStats([contrat({ id: 1, montantHT: "" })]).caAnnuel).toBe(0);
  });
});

describe("filterContrats", () => {
  const list = [
    contrat({ id: 1, reference: "CTR-00001", titre: "Chaudière", clientId: 1, statut: "actif" }),
    contrat({ id: 2, reference: "CTR-00002", titre: "Climatisation", clientId: 2, statut: "suspendu" }),
  ];
  const nomClient = (c: Contrat) => (c.clientId === 1 ? "Dupont Jean" : "Martin Paul");
  it("filtre par statut (« tous » = pas de filtre)", () => {
    expect(filterContrats(list, { search: "", statut: "tous", nomClient })).toHaveLength(2);
    expect(filterContrats(list, { search: "", statut: "actif", nomClient }).map((c) => c.id)).toEqual([1]);
  });
  it("recherche accent-insensible sur référence / titre / client", () => {
    expect(filterContrats(list, { search: "chaudiere", statut: "tous", nomClient }).map((c) => c.id)).toEqual([1]);
    expect(filterContrats(list, { search: "martin", statut: "tous", nomClient }).map((c) => c.id)).toEqual([2]);
    expect(filterContrats(list, { search: "00002", statut: "tous", nomClient }).map((c) => c.id)).toEqual([2]);
  });
});

describe("statutVariant", () => {
  it("mappe le statut vers la variante de badge", () => {
    expect(statutVariant("actif")).toBe("default");
    expect(statutVariant("suspendu")).toBe("secondary");
    expect(statutVariant("annule")).toBe("destructive");
    expect(statutVariant("termine")).toBe("outline");
    expect(statutVariant("inconnu")).toBe("outline");
  });
});

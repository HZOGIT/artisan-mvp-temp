import { describe, expect, it } from "vitest";
import {
  clientLabel,
  isBrouillon,
  filterFactures,
  computeEncoursSummary,
  type Facture,
  type FactureClient,
} from "./facture";

// Fabriques minimales (champs non testés remplis loosely) → fonctions PURES testées sans réseau ni i18n.
const mkF = (p: Partial<Facture> & { id: number }): Facture =>
  ({
    numero: `F-${p.id}`,
    objet: "",
    clientId: null,
    statut: "brouillon",
    typeDocument: "facture",
    totalTTC: "0",
    montantPaye: "0",
    ...p,
  } as unknown as Facture);
const mkC = (p: Partial<FactureClient> & { id: number }): FactureClient =>
  ({ nom: "", prenom: "", ...p } as unknown as FactureClient);

const noName = () => "";

describe("isBrouillon", () => {
  it("vrai seulement pour le statut brouillon", () => {
    expect(isBrouillon("brouillon")).toBe(true);
    expect(isBrouillon("envoyee")).toBe(false);
    expect(isBrouillon(null)).toBe(false);
  });
});

describe("clientLabel", () => {
  it("compose nom + prénom, tolère l'absence", () => {
    expect(clientLabel(mkC({ id: 1, nom: "Dupont", prenom: "Jean" }))).toBe("Dupont Jean");
    expect(clientLabel(mkC({ id: 2, nom: "Martin", prenom: null as unknown as string }))).toBe("Martin");
    expect(clientLabel(undefined)).toBe("");
  });
});

describe("filterFactures", () => {
  const factures = [
    mkF({ id: 1, statut: "brouillon", typeDocument: "facture" }),
    mkF({ id: 2, statut: "envoyee", typeDocument: "facture" }),
    mkF({ id: 3, statut: "payee", typeDocument: "facture" }),
    mkF({ id: 4, statut: "en_retard", typeDocument: "avoir" }),
  ];

  it("filtre par type document", () => {
    const r = filterFactures(factures, { typeFilter: "avoir", statusFilter: "all", searchQuery: "", resolveClientName: noName });
    expect(r.map((f) => f.id)).toEqual([4]);
  });

  it("statut 'impayees' exclut payée / annulée / brouillon", () => {
    const r = filterFactures(factures, { typeFilter: "tous", statusFilter: "impayees", searchQuery: "", resolveClientName: noName });
    expect(r.map((f) => f.id)).toEqual([2, 4]);
  });

  it("statut 'en_retard' ne garde que les en retard", () => {
    const r = filterFactures(factures, { typeFilter: "tous", statusFilter: "en_retard", searchQuery: "", resolveClientName: noName });
    expect(r.map((f) => f.id)).toEqual([4]);
  });

  it("recherche sur numéro / objet / nom client (résolveur)", () => {
    const data = [mkF({ id: 10, numero: "F-2024-007", clientId: 5 }), mkF({ id: 11, numero: "F-2024-008", clientId: 9 })];
    const r = filterFactures(data, {
      typeFilter: "tous",
      statusFilter: "all",
      searchQuery: "Durand",
      resolveClientName: (id) => (id === 5 ? "Durand Paul" : ""),
    });
    expect(r.map((f) => f.id)).toEqual([10]);
  });
});

describe("computeEncoursSummary", () => {
  it("renvoie hasReelles=false sans facture réelle", () => {
    const r = computeEncoursSummary([mkF({ id: 1, typeDocument: "avoir", statut: "envoyee" })]);
    expect(r.hasReelles).toBe(false);
  });

  it("somme le reste à payer des impayées et déduit le crédit d'avoirs", () => {
    const factures = [
      mkF({ id: 1, typeDocument: "facture", statut: "envoyee", totalTTC: "100", montantPaye: "30" }), // reste 70
      mkF({ id: 2, typeDocument: "facture", statut: "en_retard", totalTTC: "50", montantPaye: "0" }), // reste 50
      mkF({ id: 3, typeDocument: "facture", statut: "payee", totalTTC: "999", montantPaye: "999" }), // ignorée
      mkF({ id: 4, typeDocument: "avoir", statut: "envoyee", totalTTC: "-20" }), // crédit 20
    ];
    const r = computeEncoursSummary(factures);
    expect(r.hasReelles).toBe(true);
    expect(r.impayeesCount).toBe(2);
    expect(r.totalImpaye).toBeCloseTo(100); // 70 + 50 - 20
    expect(r.totalEnRetard).toBeCloseTo(50);
  });

  it("borne le total en retard par le total impayé (avoirs > impayés)", () => {
    const factures = [
      mkF({ id: 1, typeDocument: "facture", statut: "en_retard", totalTTC: "40", montantPaye: "0" }),
      mkF({ id: 2, typeDocument: "avoir", statut: "envoyee", totalTTC: "-100" }),
    ];
    const r = computeEncoursSummary(factures);
    expect(r.totalImpaye).toBe(0);
    expect(r.totalEnRetard).toBe(0);
  });
});

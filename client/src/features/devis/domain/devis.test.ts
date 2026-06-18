import { describe, expect, it } from "vitest";
import {
  clientLabel,
  filterDevis,
  countByStatut,
  STATUT_KEYS,
  type Devis,
  type DevisClient,
} from "./devis";

// Fabriques minimales (champs non testés remplis loosely) → fonctions PURES testées sans réseau ni i18n.
const mkD = (p: Partial<Devis> & { id: number }): Devis =>
  ({ numero: `D-${p.id}`, objet: "", clientId: null, statut: "brouillon", ...p } as unknown as Devis);
const mkC = (p: Partial<DevisClient> & { id: number }): DevisClient =>
  ({ nom: "", prenom: "", ...p } as unknown as DevisClient);

const noName = () => "";

describe("STATUT_KEYS", () => {
  it("liste les 5 statuts dans l'ordre d'affichage", () => {
    expect(STATUT_KEYS).toEqual(["brouillon", "envoye", "accepte", "refuse", "expire"]);
  });
});

describe("clientLabel", () => {
  it("compose nom + prénom, tolère l'absence", () => {
    expect(clientLabel(mkC({ id: 1, nom: "Durand", prenom: "Paul" }))).toBe("Durand Paul");
    expect(clientLabel(mkC({ id: 2, nom: "Martin", prenom: null as unknown as string }))).toBe("Martin");
    expect(clientLabel(undefined)).toBe("");
  });
});

describe("filterDevis", () => {
  const devis = [
    mkD({ id: 1, statut: "brouillon", numero: "D-2024-001", clientId: 5 }),
    mkD({ id: 2, statut: "envoye", numero: "D-2024-002", clientId: 9 }),
    mkD({ id: 3, statut: "accepte", numero: "D-2024-003", objet: "Toiture", clientId: 9 }),
  ];

  it("ne filtre rien avec statut 'all' et sans recherche", () => {
    expect(filterDevis(devis, { statusFilter: "all", searchQuery: "", resolveClientName: noName })).toHaveLength(3);
  });

  it("filtre par statut", () => {
    const r = filterDevis(devis, { statusFilter: "envoye", searchQuery: "", resolveClientName: noName });
    expect(r.map((d) => d.id)).toEqual([2]);
  });

  it("recherche sur numéro / objet / nom client (via résolveur)", () => {
    expect(
      filterDevis(devis, { statusFilter: "all", searchQuery: "Toiture", resolveClientName: noName }).map((d) => d.id),
    ).toEqual([3]);
    expect(
      filterDevis(devis, {
        statusFilter: "all",
        searchQuery: "Durand",
        resolveClientName: (id) => (id === 5 ? "Durand Paul" : ""),
      }).map((d) => d.id),
    ).toEqual([1]);
  });

  it("combine statut + recherche", () => {
    const r = filterDevis(devis, { statusFilter: "accepte", searchQuery: "D-2024-003", resolveClientName: noName });
    expect(r.map((d) => d.id)).toEqual([3]);
  });
});

describe("countByStatut", () => {
  it("compte les devis par statut", () => {
    const counts = countByStatut([
      mkD({ id: 1, statut: "brouillon" }),
      mkD({ id: 2, statut: "brouillon" }),
      mkD({ id: 3, statut: "accepte" }),
    ]);
    expect(counts.brouillon).toBe(2);
    expect(counts.accepte).toBe(1);
    expect(counts.envoye ?? 0).toBe(0);
  });
});

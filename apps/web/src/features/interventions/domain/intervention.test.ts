import { describe, expect, it } from "vitest";
import {
  toInterventionStatut,
  filterInterventions,
  groupEquipeByIntervention,
  membreName,
  availableTechniciens,
  buildAdresse,
  dureeDescriptor,
  STATUT_KEYS,
  type Intervention,
  type Technicien,
  type EquipeMembre,
  type EquipeByArtisanRow,
} from "./intervention";

const mkI = (p: Partial<Intervention> & { id: number }): Intervention =>
  ({ titre: "", description: "", adresse: "", statut: "planifiee", ...p } as unknown as Intervention);
const mkT = (p: Partial<Technicien> & { id: number }): Technicien =>
  ({ nom: "", prenom: "", ...p } as unknown as Technicien);
const mkM = (p: Partial<EquipeMembre> & { id: number; technicienId: number }): EquipeMembre =>
  ({ nom: "", prenom: "", ...p } as unknown as EquipeMembre);
const mkR = (p: Partial<EquipeByArtisanRow> & { interventionId: number; technicienId: number }): EquipeByArtisanRow =>
  ({ nom: "", prenom: "", ...p } as unknown as EquipeByArtisanRow);

describe("toInterventionStatut", () => {
  it("garde un statut valide, sinon planifiee", () => {
    expect(STATUT_KEYS).toContain("en_cours");
    expect(toInterventionStatut("terminee")).toBe("terminee");
    expect(toInterventionStatut("n_importe_quoi")).toBe("planifiee");
    expect(toInterventionStatut(null)).toBe("planifiee");
  });
});

describe("filterInterventions", () => {
  const list = [
    mkI({ id: 1, statut: "planifiee", titre: "Fuite cuisine" }),
    mkI({ id: 2, statut: "terminee", titre: "Chaudière", adresse: "12 rue Bleue" }),
    mkI({ id: 3, statut: "planifiee", description: "remplacement joint" }),
  ];
  it("filtre par statut", () => {
    expect(filterInterventions(list, { statusFilter: "terminee", searchQuery: "" }).map((i) => i.id)).toEqual([2]);
  });
  it("recherche titre/description/adresse", () => {
    expect(filterInterventions(list, { statusFilter: "all", searchQuery: "Bleue" }).map((i) => i.id)).toEqual([2]);
    expect(filterInterventions(list, { statusFilter: "all", searchQuery: "joint" }).map((i) => i.id)).toEqual([3]);
  });
});

describe("groupEquipeByIntervention", () => {
  it("indexe les membres par interventionId", () => {
    const rows = [
      mkR({ interventionId: 1, technicienId: 10 }),
      mkR({ interventionId: 1, technicienId: 11 }),
      mkR({ interventionId: 2, technicienId: 12 }),
    ];
    const map = groupEquipeByIntervention(rows);
    expect(map.get(1)?.map((m) => m.technicienId)).toEqual([10, 11]);
    expect(map.get(2)?.length).toBe(1);
    expect(map.get(99)).toBeUndefined();
  });
});

describe("membreName", () => {
  it("compose prénom + nom, vide si inconnu", () => {
    expect(membreName({ prenom: "Léa", nom: "Martin" })).toBe("Léa Martin");
    expect(membreName({ prenom: null, nom: "Martin" })).toBe("Martin");
    expect(membreName({ prenom: null, nom: null })).toBe("");
  });
});

describe("availableTechniciens", () => {
  it("exclut ceux déjà dans l'équipe", () => {
    const techs = [mkT({ id: 1 }), mkT({ id: 2 }), mkT({ id: 3 })];
    const equipe = [mkM({ id: 100, technicienId: 2 })];
    expect(availableTechniciens(techs, equipe).map((t) => t.id)).toEqual([1, 3]);
  });
});

describe("buildAdresse", () => {
  it("compose 'adresse, CP Ville' et nettoie", () => {
    expect(buildAdresse({ adresse: "1 rue A", codePostal: "75001", ville: "Paris" })).toBe("1 rue A, 75001 Paris");
    expect(buildAdresse({ adresse: "1 rue A", codePostal: null, ville: null })).toBe("1 rue A");
    expect(buildAdresse({ adresse: null, codePostal: "75001", ville: "Paris" })).toBe("");
    expect(buildAdresse(undefined)).toBe("");
  });
});

describe("dureeDescriptor", () => {
  it("none / minutes / heures-minutes", () => {
    expect(dureeDescriptor(null)).toEqual({ kind: "none" });
    expect(dureeDescriptor(45)).toEqual({ kind: "min", m: 45 });
    expect(dureeDescriptor(90)).toEqual({ kind: "hm", h: 1, mm: "30" });
    expect(dureeDescriptor(125)).toEqual({ kind: "hm", h: 2, mm: "05" });
  });
});

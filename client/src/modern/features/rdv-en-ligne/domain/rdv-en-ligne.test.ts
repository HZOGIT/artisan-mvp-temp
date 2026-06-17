import { describe, expect, it } from "vitest";
import { statutClass, urgenceClass, clientName, filterByStatut, STATUT_FILTERS, type RdvItem } from "./rdv-en-ligne";

describe("rdv-en-ligne — domain pur", () => {
  it("statutClass mappe le statut", () => {
    expect(statutClass("en_attente")).toContain("yellow");
    expect(statutClass("confirme")).toContain("green");
    expect(statutClass("refuse")).toContain("red");
    expect(statutClass("inconnu")).toBe("");
  });

  it("urgenceClass mappe l'urgence (normale par défaut)", () => {
    expect(urgenceClass("urgente")).toContain("orange");
    expect(urgenceClass("tres_urgente")).toContain("red");
    expect(urgenceClass("normale")).toContain("gray");
  });

  it("clientName : prénom+nom, vide si pas de client", () => {
    expect(clientName({ prenom: "Marc", nom: "Dubois" } as RdvItem["client"])).toBe("Marc Dubois");
    expect(clientName({ prenom: null, nom: "Dubois" } as RdvItem["client"])).toBe("Dubois");
    expect(clientName(null)).toBe("");
  });

  it("STATUT_FILTERS : 4 filtres de parité", () => {
    expect(STATUT_FILTERS).toEqual(["tous", "en_attente", "confirme", "refuse"]);
  });

  it("filterByStatut : 'tous' = tout, sinon par statut (filtre client-side)", () => {
    const list = [{ id: 1, statut: "en_attente" }, { id: 2, statut: "confirme" }] as unknown as RdvItem[];
    expect(filterByStatut(list, "tous")).toHaveLength(2);
    expect(filterByStatut(list, "confirme").map((r) => r.id)).toEqual([2]);
  });
});

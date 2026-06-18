import { describe, expect, it } from "vitest";
import { statutClass, statutVariant, technicienPrenom, CARBURANTS, type Technicien } from "./vehicules";

describe("vehicules — domain pur", () => {
  it("statutClass : fond coloré pour actif/maintenance/hors_service, null sinon", () => {
    expect(statutClass("actif")).toBe("bg-green-500");
    expect(statutClass("en_maintenance")).toBe("bg-yellow-500");
    expect(statutClass("hors_service")).toBe("bg-red-500");
    expect(statutClass("vendu")).toBeNull();
    expect(statutClass("inconnu")).toBeNull();
  });

  it("statutVariant : secondary pour vendu uniquement", () => {
    expect(statutVariant("vendu")).toBe("secondary");
    expect(statutVariant("actif")).toBeUndefined();
  });

  it("technicienPrenom : prénom assigné, repli N/A", () => {
    const techs = [{ id: 1, prenom: "Marc", nom: "Dubois" }] as unknown as Technicien[];
    expect(technicienPrenom(techs, 1)).toBe("Marc");
    expect(technicienPrenom(techs, 99)).toBe("N/A");
    expect(technicienPrenom(techs, null)).toBe("N/A");
  });

  it("CARBURANTS : 5 types de parité", () => {
    expect(CARBURANTS).toEqual(["essence", "diesel", "electrique", "hybride", "gpl"]);
  });
});

import { describe, expect, it } from "vitest";
import { categorieClass, rankMedal, progressPct, maxPoints, technicienLabel, PERIODES, type ClassementEntry } from "./badges";

describe("badges — domain pur", () => {
  it("categorieClass mappe la catégorie sur une couleur", () => {
    expect(categorieClass("interventions")).toBe("bg-blue-500");
    expect(categorieClass("avis")).toBe("bg-green-500");
    expect(categorieClass("special")).toBe("bg-pink-500");
    expect(categorieClass("inconnu")).toBe("");
  });

  it("rankMedal : 🥇🥈🥉 pour 0/1/2, null au-delà", () => {
    expect(rankMedal(0)).toBe("🥇");
    expect(rankMedal(2)).toBe("🥉");
    expect(rankMedal(3)).toBeNull();
  });

  it("progressPct : ratio borné 0..100", () => {
    expect(progressPct(50, 100)).toBe(50);
    expect(progressPct(200, 100)).toBe(100); // borné haut
    expect(progressPct(10, 0)).toBe(0); // garde division par zéro
  });

  it("maxPoints : total du 1er, repli 1", () => {
    expect(maxPoints([{ pointsTotal: 80 }, { pointsTotal: 20 }] as ClassementEntry[])).toBe(80);
    expect(maxPoints([])).toBe(1);
  });

  it("technicienLabel : prénom+nom, repli « Technicien »", () => {
    expect(technicienLabel({ prenom: "Marc", nom: "Dubois" })).toBe("Marc Dubois");
    expect(technicienLabel(undefined)).toBe("Technicien");
  });

  it("PERIODES : 4 périodes de parité", () => {
    expect(PERIODES).toEqual(["semaine", "mois", "trimestre", "annee"]);
  });
});

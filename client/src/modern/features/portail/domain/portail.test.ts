import { describe, expect, it } from "vitest";
import { PORTAIL_TABS, formatCurrency, devisStatutClass, factureStatutClass, isFacturePayable, interventionStatutClass, chantierStatutClass, prochaineIntervention, type PortailIntervention } from "./portail";

describe("portail (socle, slice 1)", () => {
  it("expose les 8 onglets de l'espace client (parité legacy)", () => {
    expect(PORTAIL_TABS).toEqual(["demande", "devis", "factures", "interventions", "messages", "rdv", "chantier", "infos"]);
  });
});

describe("portail slice 2 — devis/factures", () => {
  it("formatCurrency : string/number/null", () => {
    expect(formatCurrency("100.5")).toContain("100,50");
    expect(formatCurrency(null)).toContain("0,00");
    expect(formatCurrency("x")).toContain("0,00");
  });
  it("devisStatutClass mappe le statut", () => {
    expect(devisStatutClass("accepte")).toContain("green");
    expect(devisStatutClass("refuse")).toContain("red");
    expect(devisStatutClass("brouillon")).toContain("gray");
  });
  it("factureStatutClass mappe le statut", () => {
    expect(factureStatutClass("payee")).toContain("green");
    expect(factureStatutClass("en_retard")).toContain("red");
    expect(factureStatutClass("envoyee")).toContain("blue");
  });
  it("isFacturePayable : envoyée ou en retard", () => {
    expect(isFacturePayable("envoyee")).toBe(true);
    expect(isFacturePayable("en_retard")).toBe(true);
    expect(isFacturePayable("payee")).toBe(false);
    expect(isFacturePayable("brouillon")).toBe(false);
  });
});

describe("portail slice 3 — interventions/chantiers", () => {
  const i = (id: number, date: string, statut: string): PortailIntervention =>
    ({ id, dateIntervention: date, statut, titre: `I${id}` } as unknown as PortailIntervention);
  it("interventionStatutClass / chantierStatutClass mappent le statut", () => {
    expect(interventionStatutClass("terminee")).toContain("green");
    expect(interventionStatutClass("en_cours")).toContain("yellow");
    expect(chantierStatutClass("termine")).toContain("green");
    expect(chantierStatutClass("en_pause")).toContain("yellow");
  });
  it("prochaineIntervention : la planifiée à venir la plus proche", () => {
    const now = new Date("2026-06-10T00:00:00Z");
    const list = [
      i(1, "2026-06-05T10:00:00Z", "planifiee"), // passée
      i(2, "2026-06-20T10:00:00Z", "planifiee"), // future
      i(3, "2026-06-12T10:00:00Z", "planifiee"), // future + proche
      i(4, "2026-06-11T10:00:00Z", "terminee"), // pas planifiée
    ];
    expect(prochaineIntervention(list, now)?.id).toBe(3);
    expect(prochaineIntervention([i(1, "2026-06-05T10:00:00Z", "planifiee")], now)).toBeNull();
  });
});

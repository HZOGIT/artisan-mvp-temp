import { describe, expect, it } from "vitest";
import { PORTAIL_TABS, formatCurrency, devisStatutClass, factureStatutClass, isFacturePayable } from "./portail";

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

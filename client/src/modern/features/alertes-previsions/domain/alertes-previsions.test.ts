import { describe, expect, it } from "vitest";
import { isAlertePositive, formatMontant, formatDateHeure, canalHasEmail, canalHasSms, FREQUENCES } from "./alertes-previsions";

describe("alertes-previsions — domain pur", () => {
  it("isAlertePositive : 'positif' → true", () => {
    expect(isAlertePositive("positif")).toBe(true);
    expect(isAlertePositive("negatif")).toBe(false);
  });

  it("formatMontant : string/number/null → entiers € FR", () => {
    expect(formatMontant("1234.5")).toContain("€");
    expect(formatMontant("1234.5")).toContain("1");
    expect(formatMontant(null)).toBe("0€");
  });

  it("formatDateHeure : contient l'année", () => {
    expect(formatDateHeure(new Date("2026-01-13T09:30:00"))).toContain("2026");
  });

  it("FREQUENCES : 3 fréquences de parité", () => {
    expect(FREQUENCES).toEqual(["quotidien", "hebdomadaire", "mensuel"]);
  });

  it("canalHasEmail/Sms : décompose le canal new-stack (email/sms/les_deux)", () => {
    expect(canalHasEmail("email")).toBe(true);
    expect(canalHasEmail("les_deux")).toBe(true);
    expect(canalHasEmail("sms")).toBe(false);
    expect(canalHasSms("sms")).toBe(true);
    expect(canalHasSms("les_deux")).toBe(true);
    expect(canalHasSms("email")).toBe(false);
  });
});

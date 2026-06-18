import { describe, it, expect } from "vitest";
import { addMonthsClamped } from "./add-months-clamped";

// Dates construites/asserties en LOCAL (new Date(y, mIndex, d) + getFullYear/getMonth/getDate) pour
// éviter toute dépendance au fuseau horaire.
const ymd = (d: Date) => [d.getFullYear(), d.getMonth(), d.getDate()] as const;

describe("addMonthsClamped", () => {
  it("ajout simple sans débordement", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 0, 15), 1))).toEqual([2026, 1, 15]); // 15 jan → 15 fév
  });

  it("clamp fin de mois (année non bissextile) : 31 jan + 1 → 28 fév", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 0, 31), 1))).toEqual([2026, 1, 28]);
  });

  it("clamp fin de mois (année bissextile) : 31 jan 2024 + 1 → 29 fév", () => {
    expect(ymd(addMonthsClamped(new Date(2024, 0, 31), 1))).toEqual([2024, 1, 29]);
  });

  it("passage d'année vers l'avant : 30 nov 2026 + 2 → 30 jan 2027", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 10, 30), 2))).toEqual([2027, 0, 30]);
  });

  it("n négatif avec clamp : 31 mars - 1 → 28 fév", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 2, 31), -1))).toEqual([2026, 1, 28]);
  });

  it("n = 0 → date identique", () => {
    expect(ymd(addMonthsClamped(new Date(2026, 5, 15), 0))).toEqual([2026, 5, 15]);
  });

  it("+12 mois depuis le 29 fév bissextile → 28 fév l'année suivante (clamp)", () => {
    expect(ymd(addMonthsClamped(new Date(2024, 1, 29), 12))).toEqual([2025, 1, 28]);
  });

  it("ne mute pas la date d'entrée (fonction pure)", () => {
    const base = new Date(2026, 0, 31);
    addMonthsClamped(base, 3);
    expect(ymd(base)).toEqual([2026, 0, 31]);
  });
});

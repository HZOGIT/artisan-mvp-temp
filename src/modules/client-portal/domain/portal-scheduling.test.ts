import { describe, it, expect } from "vitest";
import { computeCreneauxLibres, validerDateRdv } from "./portal-scheduling";

// Lundi 2026-06-15 09:00 (TZ locale du runner) → fenêtre [+24h, +14j].
const NOW = new Date("2026-06-15T09:00:00");

describe("computeCreneauxLibres", () => {
  it("ne propose que des jours ouvrés, ≥ +24h, et exclut les occupations", () => {
    const slots = computeCreneauxLibres([], NOW).map((s) => new Date(s));
    expect(slots.length).toBeGreaterThan(0);
    // tous au moins à +24h
    const min = new Date(NOW.getTime() + 24 * 3600 * 1000);
    expect(slots.every((d) => d > min)).toBe(true);
    // aucun week-end (getDay 0=dim, 6=sam)
    expect(slots.every((d) => d.getDay() >= 1 && d.getDay() <= 5)).toBe(true);
    // heures 8..17
    expect(slots.every((d) => d.getHours() >= 8 && d.getHours() < 18)).toBe(true);
  });

  it("un créneau occupé (chevauchement) est retiré", () => {
    const libres = computeCreneauxLibres([], NOW);
    const cible = new Date(libres[0]);
    const avec = computeCreneauxLibres([{ dateDebut: cible, dateFin: new Date(cible.getTime() + 3600_000) }], NOW);
    expect(avec).not.toContain(libres[0]);
    expect(avec.length).toBe(libres.length - 1);
  });
});

describe("validerDateRdv", () => {
  it("NaN → invalide", () => {
    expect(validerDateRdv(new Date("pas une date"), NOW)).toBe("invalide");
  });
  it("< +24h → trop_tot", () => {
    expect(validerDateRdv(new Date(NOW.getTime() + 3600_000), NOW)).toBe("trop_tot");
  });
  it("> +2 ans → trop_loin", () => {
    expect(validerDateRdv(new Date(NOW.getTime() + 3 * 365 * 24 * 3600_000), NOW)).toBe("trop_loin");
  });
  it("dans la fenêtre → ok", () => {
    expect(validerDateRdv(new Date(NOW.getTime() + 3 * 24 * 3600_000), NOW)).toBe("ok");
  });
});

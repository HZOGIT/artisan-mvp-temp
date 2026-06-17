import { describe, expect, it } from "vitest";
import { eur, fmtDate, etapeReached, availableBrouillons, filterBrouillon, TIMELINE, type DepenseBrouillon, type NoteFraisDepense } from "./note-frais";

describe("eur", () => {
  it("formate string/number, 0 si invalide/null", () => {
    expect(eur("12.5")).toContain("12,50");
    expect(eur(100)).toContain("100,00");
    expect(eur(null)).toContain("0,00");
    expect(eur("abc")).toContain("0,00");
  });
});

describe("fmtDate", () => {
  it("formate une date valide, '—' sinon", () => {
    expect(fmtDate("2026-06-10", "dd/MM/yyyy")).toBe("10/06/2026");
    expect(fmtDate(null, "dd/MM/yyyy")).toBe("—");
    expect(fmtDate("", "dd/MM/yyyy")).toBe("—");
    expect(fmtDate("pas-une-date", "dd/MM/yyyy")).toBe("—");
  });
});

describe("etapeReached", () => {
  it("vrai si l'étape ≤ statut courant, ou note rejetée", () => {
    expect(TIMELINE).toEqual(["brouillon", "soumise", "approuvee", "payee"]);
    expect(etapeReached("approuvee", 0)).toBe(true); // brouillon atteint
    expect(etapeReached("approuvee", 2)).toBe(true); // approuvee atteint
    expect(etapeReached("soumise", 2)).toBe(false); // approuvee pas atteint
    expect(etapeReached("rejetee", 3)).toBe(true); // rejetée → tout "atteint" (barre rouge)
  });
});

describe("filterBrouillon", () => {
  it("ne garde que les dépenses au statut brouillon", () => {
    const list = [{ id: 1, statut: "brouillon" }, { id: 2, statut: "soumise" }, { id: 3, statut: "brouillon" }] as unknown as DepenseBrouillon[];
    expect(filterBrouillon(list).map((d) => d.id)).toEqual([1, 3]);
  });
});

describe("availableBrouillons", () => {
  const b = (id: number): DepenseBrouillon => ({ id } as unknown as DepenseBrouillon);
  const inc = (id: number): NoteFraisDepense => ({ id } as unknown as NoteFraisDepense);
  it("exclut les dépenses déjà incluses + limite", () => {
    const brouillons = [b(1), b(2), b(3)];
    expect(availableBrouillons(brouillons, [inc(2)]).map((d) => d.id)).toEqual([1, 3]);
    expect(availableBrouillons([b(1), b(2), b(3)], [], 2).map((d) => d.id)).toEqual([1, 2]);
  });
});

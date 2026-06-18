import { describe, expect, it } from "vitest";
import { eur, urgenceColor, suggestionMontant, totalEstime, isAccepted, safeErrorMsg, type Resultat, type Suggestion } from "./analyses-photos";

const sugg = (sel: boolean, q: number, p: number): Suggestion => ({ selectionne: sel, quantiteSuggeree: q, prixEstime: p } as unknown as Suggestion);
const res = (suggestions: Suggestion[]): Resultat => ({ suggestions } as unknown as Resultat);

describe("analyses-photos — domain pur", () => {
  it("urgenceColor : critique/haute/moyenne/défaut", () => {
    expect(urgenceColor("critique")).toContain("rose");
    expect(urgenceColor("haute")).toContain("orange");
    expect(urgenceColor("moyenne")).toContain("amber");
    expect(urgenceColor("basse")).toContain("slate");
  });

  it("suggestionMontant / totalEstime : somme des sélectionnées uniquement", () => {
    expect(suggestionMontant(sugg(true, 2, 50))).toBe(100);
    const resultats = [res([sugg(true, 2, 50), sugg(false, 10, 99)]), res([sugg(true, 1, 30)])];
    expect(totalEstime(resultats)).toBe(130); // 100 + 30 (le non sélectionné ignoré)
    expect(totalEstime([])).toBe(0);
  });

  it("isAccepted : type MIME OU extension", () => {
    expect(isAccepted("x.heic", "")).toBe(true);
    expect(isAccepted("photo", "image/png")).toBe(true);
    expect(isAccepted("doc.pdf", "application/pdf")).toBe(false);
  });

  it("safeErrorMsg : strip data: base64, tronque", () => {
    expect(safeErrorMsg(new Error("boom data:image/png;base64,ABCDEF123456"))).toContain("[image]");
    expect(safeErrorMsg(new Error("x".repeat(300))).length).toBeLessThanOrEqual(241);
    expect(safeErrorMsg(null, "repli")).toBe("repli");
  });

  it("eur : entier €", () => {
    expect(eur(1500)).toContain("€");
    expect(eur(null)).toContain("0");
  });
});

import { describe, expect, it } from "vitest";
import { suggestionToEditable, buildEditedMap, newSuggestion, lineTotal, calculateTotal, selectedCount, urgenceColor, statutVariant, buildUpdatePayload, type Suggestion, type Resultat, type SuggestionEditable } from "./devis-ia";

const sugg = (id: number, q: number | string, p: string, sel: boolean): Suggestion =>
  ({ id, nomArticle: `A${id}`, quantiteSuggeree: q, unite: "u", prixEstime: p, selectionne: sel, confiance: 90 } as unknown as Suggestion);
const editable = (id: number, q: number, p: string, sel: boolean): SuggestionEditable =>
  ({ id, nomArticle: `A${id}`, quantiteSuggeree: q, unite: "u", prixEstime: p, selectionne: sel, confiance: 90 });

describe("devis-ia — domain pur", () => {
  it("suggestionToEditable : coercitions string→number + défauts", () => {
    const e = suggestionToEditable(sugg(1, "3", "12.50", true));
    expect(e.quantiteSuggeree).toBe(3);
    expect(e.prixEstime).toBe("12.50");
    expect(e.unite).toBe("u");
  });

  it("buildEditedMap : indexe toutes les suggestions par id", () => {
    const resultats = [{ suggestions: [sugg(1, 1, "10", true), sugg(2, 2, "5", false)] }] as unknown as Resultat[];
    const map = buildEditedMap(resultats);
    expect(Object.keys(map)).toEqual(["1", "2"]);
  });

  it("lineTotal + calculateTotal : seules les sélectionnées comptent", () => {
    expect(lineTotal(editable(1, 2, "50", true))).toBe(100);
    const edited = { 1: editable(1, 2, "50", true), 2: editable(2, 1, "30", false) };
    const news = [editable(99, 3, "10", true)];
    expect(calculateTotal(edited, news)).toBe(130); // 100 + 30(non sel, ignoré) + 30
    expect(selectedCount(edited, news)).toBe(2);
  });

  it("newSuggestion : valeurs par défaut + isNew", () => {
    const n = newSuggestion(12345);
    expect(n).toMatchObject({ id: 12345, quantiteSuggeree: 1, selectionne: true, isNew: true });
  });

  it("urgenceColor / statutVariant", () => {
    expect(urgenceColor("critique")).toContain("red");
    expect(urgenceColor("faible")).toContain("gray");
    expect(urgenceColor(null)).toContain("blue");
    expect(statutVariant("termine")).toBe("default");
    expect(statutVariant("erreur")).toBe("destructive");
    expect(statutVariant("en_cours")).toBe("secondary");
  });

  it("buildUpdatePayload : quantité en chaîne", () => {
    expect(buildUpdatePayload(editable(7, 4, "9.99", true))).toEqual({ id: 7, selectionne: true, quantiteSuggeree: "4", prixEstime: "9.99" });
  });
});

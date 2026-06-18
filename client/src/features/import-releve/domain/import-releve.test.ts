import { describe, expect, it } from "vitest";
import { eur, detectSeparator, parsePreview } from "./import-releve";

describe("import-releve — domain pur", () => {
  it("eur : entiers €", () => {
    expect(eur(1500)).toContain("€");
    expect(eur(null)).toContain("0");
  });

  it("detectSeparator : ; si dominant, sinon ,", () => {
    expect(detectSeparator("a;b;c")).toBe(";");
    expect(detectSeparator("a,b,c")).toBe(",");
    expect(detectSeparator("a,b;c,d")).toBe(",");
  });

  it("parsePreview : 6 lignes non vides max, 5 colonnes, séparateur auto", () => {
    const csv = "Date;Libelle;Montant\n01/01;Café;-3,50\n02/01;Loyer;-800\n\n03/01;Salaire;2000";
    const rows = parsePreview(csv);
    expect(rows[0]).toEqual(["Date", "Libelle", "Montant"]);
    expect(rows).toHaveLength(4); // ligne vide ignorée
    expect(rows.every((r) => r.length <= 5)).toBe(true);
  });

  it("parsePreview : limite à 6 lignes", () => {
    const csv = Array.from({ length: 20 }, (_, i) => `a,b,c${i}`).join("\n");
    expect(parsePreview(csv)).toHaveLength(6);
  });
});

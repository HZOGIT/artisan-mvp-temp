import { describe, expect, it } from "vitest";
import { eur, detectSeparator, parsePreview, parseHeaders, autoDetectMapping } from "./import-releve";

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

  it("parseHeaders : retourne tous les en-têtes (sans limite à 5)", () => {
    const csv = "Col1;Col2;Col3;Col4;Col5;Col6\nval1;val2;val3;val4;val5;val6";
    expect(parseHeaders(csv)).toEqual(["Col1", "Col2", "Col3", "Col4", "Col5", "Col6"]);
  });

  it("autoDetectMapping : détecte date/libellé/montant par nom", () => {
    const detected = autoDetectMapping(["Date", "Libelle", "Montant"]);
    expect(detected.date).toBe("Date");
    expect(detected.libelle).toBe("Libelle");
    expect(detected.montant).toBe("Montant");
    expect(detected.debit).toBeUndefined();
  });

  it("autoDetectMapping : détecte débit/crédit accentués", () => {
    const detected = autoDetectMapping(["Date", "Description", "Débit", "Crédit"]);
    expect(detected.debit).toBe("Débit");
    expect(detected.credit).toBe("Crédit");
    expect(detected.montant).toBeUndefined();
  });

  it("autoDetectMapping : retourne undefined pour colonnes inconnues", () => {
    const detected = autoDetectMapping(["XDate", "XLib", "XMontant"]);
    expect(detected.date).toBeUndefined();
    expect(detected.libelle).toBeUndefined();
  });
});

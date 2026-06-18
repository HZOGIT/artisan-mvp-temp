import { describe, it, expect } from "vitest";
import { csvCell, fecAmount, formatDateFr, ymdCompact, buildFacturesCsv, csvFileName, type FactureCsvRow } from "./csv-export";

describe("csv-export domain (pur)", () => {
  it("fecAmount : virgule décimale, 2 décimales", () => {
    expect(fecAmount("1234.5")).toBe("1234,50");
    expect(fecAmount(0)).toBe("0,00");
    expect(fecAmount(null)).toBe("0,00");
  });

  it("formatDateFr : JJ/MM/AAAA déterministe", () => {
    expect(formatDateFr(new Date("2026-06-09T10:00:00Z"))).toMatch(/^0?9\/06\/2026$/);
  });

  it("ymdCompact : AAAAMMJJ", () => {
    expect(ymdCompact(new Date("2026-01-05T00:00:00"))).toBe("20260105");
  });

  describe("csvCell (anti-injection OPE-180)", () => {
    it("nombre pur inchangé", () => {
      expect(csvCell("1234,50")).toBe("1234,50");
      expect(csvCell("-10.5")).toBe("-10.5");
    });
    it("injection de formule (=,+,-,@,TAB,CR) → préfixe apostrophe", () => {
      expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
      expect(csvCell("@cmd")).toBe("'@cmd");
      expect(csvCell("+1")).toBe("'+1"); // pas un nombre pur (commence par +)
    });
    it("rupture de structure (; \" newline) → échappement RFC 4180", () => {
      expect(csvCell("Dupont;Jean")).toBe('"Dupont;Jean"');
      expect(csvCell('a"b')).toBe('"a""b"');
      expect(csvCell("ligne1\nligne2")).toBe('"ligne1\nligne2"');
    });
    it("texte sain inchangé", () => {
      expect(csvCell("Durand")).toBe("Durand");
    });
  });

  it("buildFacturesCsv : BOM + entête + lignes neutralisées", () => {
    const rows: FactureCsvRow[] = [
      { dateFacture: new Date("2026-06-10T00:00:00"), numero: "FAC-1", clientNom: "Durand;Jean", totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", statut: "payee" },
    ];
    const csv = buildFacturesCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toContain("Date;Numéro;Client;HT;TVA;TTC;Statut");
    expect(csv).toContain('10/06/2026;FAC-1;"Durand;Jean";100,00;20,00;120,00;payee');
  });

  it("csvFileName : factures_<début>_<fin>.csv", () => {
    expect(csvFileName(new Date("2026-01-01T00:00:00"), new Date("2026-06-30T00:00:00"))).toBe("factures_20260101_20260630.csv");
  });
});

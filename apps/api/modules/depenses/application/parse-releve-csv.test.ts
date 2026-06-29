import { describe, it, expect } from "vitest";
import { parseReleveCsv } from "./parse-releve-csv";
import { ValidationError } from "../../../shared/errors";

describe("parseReleveCsv (pur)", () => {
  it("CSV vide ou < 2 lignes → []", () => {
    expect(parseReleveCsv("")).toEqual([]);
    expect(parseReleveCsv("date;libelle;montant")).toEqual([]);
  });

  it("séparateur ; ; date FR → ISO ; type selon le signe", () => {
    const csv = "Date;Libelle;Montant\n15/06/2026;CARREFOUR;-42,50\n20/06/2026;VIREMENT CLIENT;1000,00";
    const r = parseReleveCsv(csv);
    expect(r).toEqual([
      { dateTransaction: "2026-06-15", libelle: "CARREFOUR", montant: -42.5, typeTransaction: "debit" },
      { dateTransaction: "2026-06-20", libelle: "VIREMENT CLIENT", montant: 1000, typeTransaction: "credit" },
    ]);
  });

  it("colonnes débit/crédit nommées : débit positif → montant négatif, crédit positif → montant positif", () => {
    const csv = "date,libelle,debit,credit\n10/01/2026,LOYER,800.00,0\n12/01/2026,REMBOURSEMENT,0,150.00";
    const r = parseReleveCsv(csv);
    expect(r[0]).toEqual({ dateTransaction: "2026-01-10", libelle: "LOYER", montant: -800, typeTransaction: "debit" });
    expect(r[1]).toEqual({ dateTransaction: "2026-01-12", libelle: "REMBOURSEMENT", montant: 150, typeTransaction: "credit" });
  });

  it("ignore les lignes < 3 colonnes ou sans libellé/date", () => {
    const csv = "date;libelle;montant\n15/06/2026;OK;-10\nligne;incomplete\n;;\n16/06/2026;;-5";
    expect(parseReleveCsv(csv).map((t) => t.libelle)).toEqual(["OK"]);
  });

  it("> 5000 lignes de données → ValidationError", () => {
    const lignes = ["date;libelle;montant", ...Array.from({ length: 5001 }, (_, i) => `15/06/2026;L${i};-1`)];
    expect(() => parseReleveCsv(lignes.join("\n"))).toThrow(ValidationError);
  });

  it("auto-détection : ordre de colonnes inversé (montant ; date ; libellé)", () => {
    const csv = "Montant;Date;Libelle\n-42,50;15/06/2026;CARREFOUR\n1000;20/06/2026;VIREMENT";
    const r = parseReleveCsv(csv);
    expect(r[0]).toEqual({ dateTransaction: "2026-06-15", libelle: "CARREFOUR", montant: -42.5, typeTransaction: "debit" });
    expect(r[1]).toEqual({ dateTransaction: "2026-06-20", libelle: "VIREMENT", montant: 1000, typeTransaction: "credit" });
  });

  it("date ISO YYYY-MM-DD → conservée telle quelle", () => {
    const csv = "date;libelle;montant\n2026-01-15;LOYER;-800\n2026-02-20;EDF;-60";
    const r = parseReleveCsv(csv);
    expect(r[0].dateTransaction).toBe("2026-01-15");
    expect(r[1].dateTransaction).toBe("2026-02-20");
  });

  it("date DD-MM-YYYY → converti en YYYY-MM-DD", () => {
    const csv = "date;libelle;montant\n15-01-2026;LOYER;-800";
    const r = parseReleveCsv(csv);
    expect(r[0].dateTransaction).toBe("2026-01-15");
  });

  it("mapping explicite : colonnes nommées différemment", () => {
    const csv = "val;intitule;dte\n-42,50;CARREFOUR;15/06/2026\n1000;VIREMENT;20/06/2026";
    const r = parseReleveCsv(csv, { date: "dte", libelle: "intitule", montant: "val" });
    expect(r[0]).toEqual({ dateTransaction: "2026-06-15", libelle: "CARREFOUR", montant: -42.5, typeTransaction: "debit" });
    expect(r[1]).toEqual({ dateTransaction: "2026-06-20", libelle: "VIREMENT", montant: 1000, typeTransaction: "credit" });
  });

  it("mapping explicite débit+crédit", () => {
    const csv = "dte;label;out;in\n10/01/2026;LOYER;500;0\n12/01/2026;SALAIRE;0;2000";
    const r = parseReleveCsv(csv, { date: "dte", libelle: "label", debit: "out", credit: "in" });
    expect(r[0]).toEqual({ dateTransaction: "2026-01-10", libelle: "LOYER", montant: -500, typeTransaction: "debit" });
    expect(r[1]).toEqual({ dateTransaction: "2026-01-12", libelle: "SALAIRE", montant: 2000, typeTransaction: "credit" });
  });

  it("pas d'en-tête reconnu → fallback positionnel (col0=date, col1=libellé, col2=montant)", () => {
    const csv = "XDate;XLib;XMontant\n15/06/2026;CARREFOUR;-42,50";
    const r = parseReleveCsv(csv);
    expect(r[0]).toEqual({ dateTransaction: "2026-06-15", libelle: "CARREFOUR", montant: -42.5, typeTransaction: "debit" });
  });
});

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

  it("séparateur , ; col2 prioritaire ; fallback colonne crédit quand col2=0 (parité legacy)", () => {
    // header a plus de , que de ; → séparateur virgule. Heuristique legacy : montant = col2 si
    // valide/≠0 ; sinon on retombe sur debit(col2)/credit(col3) → seul le crédit en col3 ressort.
    const csv = "date,libelle,debit,credit\n10/01/2026,LOYER,800.00,0\n12/01/2026,REMBOURSEMENT,0,150.00";
    const r = parseReleveCsv(csv);
    expect(r[0]).toEqual({ dateTransaction: "2026-01-10", libelle: "LOYER", montant: 800, typeTransaction: "credit" });
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
});

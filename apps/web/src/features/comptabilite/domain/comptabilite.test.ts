import { describe, expect, it } from "vitest";
import { balanceTotals, ligneSoldeNet, toCsv, type BalanceLine, type CsvRow } from "./comptabilite";

const mkL = (p: Partial<BalanceLine>): BalanceLine =>
  ({ numeroCompte: "", libelleCompte: "", debit: 0, credit: 0, soldeDebiteur: 0, soldeCrediteur: 0, ...p } as BalanceLine);

describe("ligneSoldeNet", () => {
  it("solde débiteur − créditeur", () => {
    expect(ligneSoldeNet(mkL({ soldeDebiteur: 120, soldeCrediteur: 0 }))).toBe(120);
    expect(ligneSoldeNet(mkL({ soldeDebiteur: 0, soldeCrediteur: 80 }))).toBe(-80);
  });
});

describe("balanceTotals", () => {
  it("somme débit / crédit / solde net", () => {
    const balance = [
      mkL({ debit: 100, credit: 0, soldeDebiteur: 100, soldeCrediteur: 0 }),
      mkL({ debit: 0, credit: 60, soldeDebiteur: 0, soldeCrediteur: 60 }),
      mkL({ debit: 40, credit: 40, soldeDebiteur: 0, soldeCrediteur: 0 }),
    ];
    expect(balanceTotals(balance)).toEqual({ debit: 140, credit: 100, solde: 40 });
  });
  it("balance vide → zéros", () => {
    expect(balanceTotals([])).toEqual({ debit: 0, credit: 0, solde: 0 });
  });
});

describe("toCsv", () => {
  it("en-tête = clés de la 1re ligne, séparateur ;", () => {
    const rows: CsvRow[] = [
      { compte: "411", libelle: "Clients", debit: 100, credit: 0 },
      { compte: "707", libelle: "Ventes", debit: 0, credit: 100 },
    ];
    expect(toCsv(rows)).toBe("compte;libelle;debit;credit\n411;Clients;100;0\n707;Ventes;0;100");
  });
  it("valeurs null/undefined → vide", () => {
    expect(toCsv([{ a: null, b: undefined, c: "x" }])).toBe("a;b;c\n;;x");
  });
  it("liste vide → chaîne vide", () => {
    expect(toCsv([])).toBe("");
  });
});

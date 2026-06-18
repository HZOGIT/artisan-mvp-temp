import { describe, it, expect } from "vitest";
import { calculerBalance, grandLivre } from "./balance";
import type { EcritureComptable } from "../domain/ecriture";

let seq = 0;
const ec = (over: Partial<EcritureComptable>): EcritureComptable => ({
  id: ++seq, artisanId: 1, dateEcriture: new Date("2026-06-14T00:00:00Z"), journal: "VE",
  numeroCompte: "411000", libelleCompte: "Clients", libelle: "F1", pieceRef: "FAC-00001",
  debit: "0.00", credit: "0.00", factureId: 501, lettrage: null, pointage: false, createdAt: new Date(), ...over,
});

// Pièce de vente équilibrée + encaissement (pour le 411 qui se lettre).
const piece = (): EcritureComptable[] => [
  ec({ numeroCompte: "411000", debit: "120.00", journal: "VE" }),
  ec({ numeroCompte: "706000", credit: "100.00", journal: "VE", libelleCompte: "Prestations" }),
  ec({ numeroCompte: "445711", credit: "20.00", journal: "VE", libelleCompte: "TVA 20%" }),
  ec({ numeroCompte: "512000", debit: "120.00", journal: "BQ", libelleCompte: "Banque" }),
  ec({ numeroCompte: "411000", credit: "120.00", journal: "BQ" }),
];

describe("ecritures — balance (pur)", () => {
  it("agrège par compte (Σdébit/Σcrédit/solde) trié ; 411 soldé après encaissement", () => {
    const b = calculerBalance(piece());
    const c411 = b.find((l) => l.numeroCompte === "411000")!;
    expect(c411.totalDebit).toBe("120.00");
    expect(c411.totalCredit).toBe("120.00");
    expect(c411.solde).toBe("0.00"); // lettré (vente + encaissement)
    expect(b.find((l) => l.numeroCompte === "706000")!.solde).toBe("-100.00");
    expect(b.find((l) => l.numeroCompte === "512000")!.solde).toBe("120.00");
    // tri par compte
    expect(b.map((l) => l.numeroCompte)).toEqual([...b.map((l) => l.numeroCompte)].sort());
  });

  it("INVARIANT : Σ des soldes = 0 sur un ensemble équilibré", () => {
    const total = calculerBalance(piece()).reduce((s, l) => s + Number(l.solde), 0);
    expect(total).toBeCloseTo(0, 2);
  });

  it("balance vide → []", () => {
    expect(calculerBalance([])).toEqual([]);
  });
});

describe("ecritures — grand livre (pur)", () => {
  it("filtre par compte + solde progressif cumulé", () => {
    const gl = grandLivre(piece(), "411000");
    expect(gl.length).toBe(2);
    expect(gl[0].soldeProgressif).toBe("120.00"); // débit vente
    expect(gl[1].soldeProgressif).toBe("0.00"); // crédit encaissement → lettré
  });

  it("sans filtre : toutes les écritures, solde progressif par compte", () => {
    const gl = grandLivre(piece());
    expect(gl.length).toBe(5);
    // chaque compte a son cumul propre
    const dernier411 = gl.filter((l) => l.numeroCompte === "411000").at(-1)!;
    expect(dernier411.soldeProgressif).toBe("0.00");
  });
});

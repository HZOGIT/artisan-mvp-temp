import { describe, it, expect } from "vitest";
import { assembleDeclarationTVA, computeBalance, computeGrandLivre, computeRapportTVA } from "./comptabilite";
import type { Ecriture } from "./comptabilite";

const ec = (over: Partial<Ecriture>): Ecriture => ({
  id: 1,
  dateEcriture: new Date("2026-06-10"),
  journal: "VE",
  numeroCompte: "411000",
  libelleCompte: "Clients",
  libelle: "Facture F1",
  pieceRef: "F1",
  debit: "0.00",
  credit: "0.00",
  factureId: null,
  lettrage: null,
  pointage: null,
  ...over,
});

describe("comptabilite domain (pur)", () => {
  it("computeGrandLivre : groupe par compte, totaux + solde (débit−crédit)", () => {
    const gl = computeGrandLivre([
      ec({ numeroCompte: "411000", debit: "120.00", credit: "0.00" }),
      ec({ numeroCompte: "706000", debit: "0.00", credit: "100.00" }),
      ec({ numeroCompte: "411000", debit: "60.00", credit: "0.00" }),
    ]);
    const clients = gl.find((c) => c.numeroCompte === "411000")!;
    expect(clients.totalDebit).toBe(180);
    expect(clients.totalCredit).toBe(0);
    expect(clients.solde).toBe(180);
    expect(clients.ecritures).toHaveLength(2);
  });

  it("computeBalance : solde débiteur/créditeur par compte, trié par numéro", () => {
    const bal = computeBalance([
      ec({ numeroCompte: "706000", credit: "100.00" }),
      ec({ numeroCompte: "411000", debit: "120.00" }),
    ]);
    expect(bal.map((b) => b.numeroCompte)).toEqual(["411000", "706000"]);
    expect(bal[0]).toMatchObject({ soldeDebiteur: 120, soldeCrediteur: 0 });
    expect(bal[1]).toMatchObject({ soldeDebiteur: 0, soldeCrediteur: 100 });
  });

  it("INVARIANT équilibre : sur des écritures équilibrées, Σ soldeDébiteur = Σ soldeCréditeur", () => {
    // Facture 120 TTC : 411 débit 120 ; 706 crédit 100 ; 44571 crédit 20.
    const bal = computeBalance([
      ec({ numeroCompte: "411000", debit: "120.00" }),
      ec({ numeroCompte: "706000", credit: "100.00" }),
      ec({ numeroCompte: "445710", credit: "20.00" }),
    ]);
    const totDeb = bal.reduce((s, b) => s + b.soldeDebiteur, 0);
    const totCred = bal.reduce((s, b) => s + b.soldeCrediteur, 0);
    expect(totDeb).toBe(totCred);
  });

  it("computeRapportTVA : collectée (44571x crédit) − déductible (44566x débit)", () => {
    const r = computeRapportTVA([
      ec({ numeroCompte: "445710", credit: "20.00" }),
      ec({ numeroCompte: "445711", credit: "5.50" }),
      ec({ numeroCompte: "445660", debit: "8.00" }),
      ec({ numeroCompte: "706000", credit: "100.00" }), // ignoré
    ]);
    expect(r).toEqual({ tvaCollectee: 25.5, tvaDeductible: 8, tvaNette: 17.5 });
  });

  it("assembleDeclarationTVA : arrondi 2 déc., total collectée + nette", () => {
    const d = assembleDeclarationTVA(
      [
        { taux: 20, baseHT: 100.004, tvaCollectee: 20.001 },
        { taux: 10, baseHT: 50, tvaCollectee: 5 },
      ],
      8.005,
    );
    expect(d.parTaux[0]).toEqual({ taux: 20, baseHT: 100, tvaCollectee: 20 });
    expect(d.tvaCollectee).toBe(25);
    expect(d.tvaDeductible).toBe(8.01);
    expect(d.tvaNette).toBe(16.99);
  });
});

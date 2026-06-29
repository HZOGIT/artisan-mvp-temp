import { describe, it, expect } from "vitest";
import { exporterFEC, FEC_HEADER } from "./fec";
import type { EcritureComptable } from "../domain/ecriture";

let seq = 0;
const ec = (over: Partial<EcritureComptable>): EcritureComptable => ({
  id: ++seq, artisanId: 1, dateEcriture: new Date("2026-06-14T00:00:00Z"), journal: "VE",
  numeroCompte: "411000", libelleCompte: "Clients", libelle: "Facture FAC-00001", pieceRef: "FAC-00001",
  debit: "0.00", credit: "0.00", factureId: 501, lettrage: null, pointage: false, ecritureNum: null, createdAt: new Date(), ...over,
});

// Pièce de vente (3 lignes, factureId 501) + encaissement (2 lignes, factureId 501, journal BQ).
const ecritures = (): EcritureComptable[] => [
  ec({ numeroCompte: "411000", debit: "120.00", journal: "VE" }),
  ec({ numeroCompte: "706000", credit: "100.00", journal: "VE", libelleCompte: "Prestations" }),
  ec({ numeroCompte: "445711", credit: "20.00", journal: "VE", libelleCompte: "TVA 20%" }),
  ec({ numeroCompte: "512000", debit: "120.00", journal: "BQ", libelleCompte: "Banque", libelle: "Règlement FAC-00001", lettrage: "VL501" }),
  ec({ numeroCompte: "411000", credit: "120.00", journal: "BQ", libelle: "Règlement FAC-00001", lettrage: "VL501" }),
];

function parse(fec: string): { header: string[]; rows: string[][] } {
  const lines = fec.split("\n");
  return { header: lines[0].split("\t"), rows: lines.slice(1).map((l) => l.split("\t")) };
}

describe("ecritures — export FEC (format légal DGFiP)", () => {
  it("header = 18 colonnes réglementaires", () => {
    const { header } = parse(exporterFEC(ecritures()));
    expect(header).toEqual([...FEC_HEADER]);
    expect(header.length).toBe(18);
  });

  it("chaque ligne a 18 colonnes ; dates YYYYMMDD ; montants à virgule", () => {
    const { rows } = parse(exporterFEC(ecritures()));
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.length).toBe(18);
      expect(r[3]).toMatch(/^\d{8}$/); // EcritureDate YYYYMMDD
      expect(r[11]).toMatch(/^\d+,\d{2}$/); // Debit à virgule
      expect(r[12]).toMatch(/^\d+,\d{2}$/); // Credit à virgule
    }
  });

  it("EcritureNum groupe par pièce (factureId, journal) — VE=1 (3 lignes), BQ=2 (2 lignes) ; équilibre par pièce", () => {
    const { rows } = parse(exporterFEC(ecritures()));
    const ve = rows.filter((r) => r[0] === "VE");
    const bq = rows.filter((r) => r[0] === "BQ");
    expect(new Set(ve.map((r) => r[2])).size).toBe(1); // un seul EcritureNum pour la pièce VE
    expect(new Set(bq.map((r) => r[2])).size).toBe(1);
    expect(ve[0][2]).not.toBe(bq[0][2]); // VE et BQ = pièces distinctes
    // équilibre par pièce : Σdébit == Σcrédit (montants à virgule → repasser en nombre)
    const sum = (rs: string[][], col: number) => rs.reduce((s, r) => s + Number(r[col].replace(",", ".")), 0);
    expect(sum(ve, 11)).toBeCloseTo(sum(ve, 12), 2);
    expect(sum(bq, 11)).toBeCloseTo(sum(bq, 12), 2);
  });

  it("libellés nettoyés (TAB/CR/LF retirés) ; lettrage reporté en EcritureLet", () => {
    const sale = ec({ numeroCompte: "411000", debit: "10.00", journal: "VE", libelle: "Avec\ttab\net retour", lettrage: "VL999" });
    const { rows } = parse(exporterFEC([sale]));
    expect(rows[0][10]).toBe("Avec tab et retour"); // EcritureLib nettoyé
    expect(rows[0][13]).toBe("VL999"); // EcritureLet
    expect(rows[0].length).toBe(18); // pas de colonne cassée par le TAB
  });

  it("aucune écriture → header seul", () => {
    expect(exporterFEC([]).split("\n").length).toBe(1);
  });

  it("ecritureNum persisté : stable après insertion d'une nouvelle écriture (anti-régression A47 A-1)", () => {
    /** Pièce 1 : facture 100 (VE), ecritureNum=7 persisté */
    const piece1 = [
      ec({ factureId: 100, journal: "VE", ecritureNum: 7, debit: "120.00" }),
      ec({ factureId: 100, journal: "VE", ecritureNum: 7, numeroCompte: "706000", credit: "100.00" }),
    ];
    /** Pièce 2 : facture 101 (VE), insérée chronologiquement avant piece1 mais ecritureNum=8 */
    const piece2 = [
      ec({ factureId: 101, journal: "VE", ecritureNum: 8, dateEcriture: new Date("2026-01-01T00:00:00Z"), pieceRef: "FAC-00002", debit: "60.00" }),
    ];

    const avant = exporterFEC([...piece1]);
    const numAvant = avant.split("\n").slice(1).map((l) => l.split("\t")[2]);

    /* Même jeu après insertion de piece2 (chronologiquement antérieure) */
    const apres = exporterFEC([...piece1, ...piece2]);
    const numApres = apres.split("\n").slice(1)
      .filter((l) => l.split("\t")[8] === "FAC-00001") /* filtrer piece1 par PieceRef */
      .map((l) => l.split("\t")[2]);

    /* Les ecritureNum de la pièce existante ne changent pas */
    expect(numAvant).toEqual(["7", "7"]);
    expect(numApres).toEqual(["7", "7"]);
    /* La nouvelle pièce a bien son propre ecritureNum */
    const numPiece2 = apres.split("\n").slice(1).find((l) => l.split("\t")[3] === "20260101")?.split("\t")[2];
    expect(numPiece2).toBe("8");
  });
});

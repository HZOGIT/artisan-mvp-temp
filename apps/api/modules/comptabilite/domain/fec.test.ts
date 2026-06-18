import { describe, it, expect } from "vitest";
import { buildFec, compteChargeDepense, compteTvaCollectee, DEFAULT_FEC_CONFIG, fecPreview } from "./fec";
import type { FecFacture, FecInput } from "./fec";

const facture = (over: Partial<FecFacture>): FecFacture => ({
  id: 1,
  numero: "FAC-001",
  dateFacture: new Date("2026-06-10T00:00:00Z"),
  totalHT: "100.00",
  totalTVA: "20.00",
  totalTTC: "120.00",
  statut: "envoyee",
  datePaiement: null,
  typeDocument: "facture",
  clientId: 7,
  clientNom: "Durand",
  clientPrenom: "Jean",
  lignesTVA: [{ tauxTVA: "20", tva: "20.00" }],
  ...over,
});

const empty: FecInput = { factures: [], depenses: [], encaissements: [] };

describe("FEC (pur)", () => {
  it("compteTvaCollectee / compteChargeDepense : mapping par taux / catégorie", () => {
    expect(compteTvaCollectee(20).compte).toBe("445711");
    expect(compteTvaCollectee(10).compte).toBe("445712");
    expect(compteTvaCollectee(5.5).compte).toBe("445713");
    expect(compteChargeDepense("materiaux").compte).toBe("601000");
    expect(compteChargeDepense("sous-traitance").compte).toBe("604000");
    expect(compteChargeDepense(null).compte).toBe("607000");
    // Parité legacy : la regex est sans accent → une catégorie accentuée retombe sur le compte par défaut.
    expect(compteChargeDepense("Matériaux").compte).toBe("607000");
  });

  it("INVARIANT : une facture équilibrée → Σdébit = Σcrédit (conformite.equilibre)", () => {
    const r = buildFec({ ...empty, factures: [facture({})] }, DEFAULT_FEC_CONFIG);
    expect(r.conformite.totalDebit).toBe(120);
    expect(r.conformite.totalCredit).toBe(120);
    expect(r.conformite.ecart).toBe(0);
    expect(r.conformite.equilibre).toBe(true);
    expect(r.conformite.erreurs).toEqual([]);
    expect(r.conformite.nbEcritures).toBe(1);
    expect(r.conformite.nbLignes).toBe(3); // 411 débit / 706 crédit / 445711 crédit
  });

  it("INVARIANT GLOBAL : ventes + achats + banque restent équilibrés", () => {
    const input: FecInput = {
      factures: [facture({ id: 1, statut: "payee", datePaiement: new Date("2026-06-12") })],
      depenses: [{ id: 9, numero: "D-9", dateDepense: new Date("2026-06-11"), fournisseur: "ACME", categorie: "materiaux", montantHT: "50.00", montantTVA: "10.00", montantTTC: "60.00" }],
      encaissements: [{ id: 1, numero: "FAC-001", datePaiement: new Date("2026-06-12"), totalTTC: "120.00", typeDocument: "facture", clientId: 7, clientNom: "Durand", clientPrenom: "Jean" }],
    };
    const r = buildFec(input, DEFAULT_FEC_CONFIG);
    expect(r.conformite.equilibre).toBe(true);
    expect(r.conformite.ecart).toBe(0);
    expect(r.conformite.nbEcritures).toBe(3); // 1 vente + 1 achat + 1 encaissement
  });

  it("AVOIR : montants en valeur absolue, sens inversé, jamais de négatif ; reste équilibré", () => {
    const avoir = facture({ id: 2, numero: "AV-1", typeDocument: "avoir", totalHT: "-100.00", totalTVA: "-20.00", totalTTC: "-120.00", lignesTVA: [{ tauxTVA: "20", tva: "-20.00" }] });
    const r = buildFec({ ...empty, factures: [avoir] }, DEFAULT_FEC_CONFIG);
    expect(r.content).not.toMatch(/\t-\d/); // aucun montant (champ après TAB) négatif
    expect(r.conformite.equilibre).toBe(true);
    // 411 au crédit (avoir), 706 au débit.
    const rows = r.content.split("\n");
    const ligne411 = rows.find((l) => l.includes("411000"))!.split("\t");
    expect(ligne411[11]).toBe("0,00"); // Debit
    expect(ligne411[12]).toBe("120,00"); // Credit
  });

  it("FORMAT opposable : entête 18 colonnes, TAB, décimale virgule, date YYYYMMDD", () => {
    const r = buildFec({ ...empty, factures: [facture({})] }, DEFAULT_FEC_CONFIG);
    const rows = r.content.split("\n");
    expect(rows[0].split("\t")).toHaveLength(18);
    const l1 = rows[1].split("\t");
    expect(l1).toHaveLength(18);
    expect(l1[3]).toBe("20260610"); // EcritureDate YYYYMMDD
    expect(l1[11]).toBe("120,00"); // Debit virgule
    expect(l1[0]).toBe("VE"); // JournalCode
  });

  it("fecPreview : 15 premières lignes projetées + conformité + siret", () => {
    const r = buildFec({ ...empty, factures: [facture({})] }, DEFAULT_FEC_CONFIG);
    const prev = fecPreview(r, "12345678900011");
    expect(prev.siret).toBe("12345678900011");
    expect(prev.totalFactures).toBe(1);
    expect(prev.lines).toHaveLength(3);
    expect(prev.lines[0]).toMatchObject({ compteNum: "411000", debit: "120,00", credit: "0,00" });
    expect(prev.conformite.equilibre).toBe(true);
  });

  it("période vide → erreur 'Aucune ecriture', équilibre trivial", () => {
    const r = buildFec(empty, DEFAULT_FEC_CONFIG);
    expect(r.conformite.nbLignes).toBe(0);
    expect(r.conformite.erreurs).toContain("Aucune ecriture sur la periode");
  });
});

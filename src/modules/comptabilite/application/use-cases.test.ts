import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeComptabiliteReader } from "../infra/comptabilite-reader-fake";
import type { Ecriture } from "../domain/comptabilite";
import { getBalance, getDeclarationTVADetail, getFecPreview, getGrandLivre, getJournalVentes, getRapportTVA, resolvePeriode } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const NOW = new Date("2026-06-15T12:00:00Z");

const ec = (over: Partial<Ecriture>): Ecriture => ({ id: 1, dateEcriture: new Date("2026-06-10"), journal: "VE", numeroCompte: "411000", libelleCompte: "Clients", libelle: "F1", pieceRef: "F1", debit: "0.00", credit: "0.00", factureId: null, lettrage: null, pointage: null, ...over });

describe("comptabilite use-cases", () => {
  it("resolvePeriode : défaut = mois courant (1er → dernier jour)", () => {
    const p = resolvePeriode(undefined, NOW);
    expect(p.dateDebut.getFullYear()).toBe(2026);
    expect(p.dateDebut.getMonth()).toBe(5); // juin
    expect(p.dateDebut.getDate()).toBe(1);
    expect(p.dateFin.getMonth()).toBe(5);
    expect(p.dateFin.getDate()).toBe(30);
  });

  it("getGrandLivre/getBalance/getRapportTVA : agrègent les écritures du tenant (mois courant)", async () => {
    const reader = new FakeComptabiliteReader();
    reader.seedEcritures(1, [
      ec({ numeroCompte: "411000", debit: "120.00" }),
      ec({ numeroCompte: "706000", credit: "100.00" }),
      ec({ numeroCompte: "445710", credit: "20.00" }),
      ec({ numeroCompte: "411000", debit: "0", credit: "0", dateEcriture: new Date("2025-01-01") }), // hors période
    ]);
    expect((await getGrandLivre(reader, ctx(1), undefined, () => NOW)).map((c) => c.numeroCompte)).toEqual(["411000", "445710", "706000"]);
    const bal = await getBalance(reader, ctx(1), undefined, () => NOW);
    expect(bal.find((b) => b.numeroCompte === "411000")?.soldeDebiteur).toBe(120);
    expect(await getRapportTVA(reader, ctx(1), undefined, () => NOW)).toEqual({ tvaCollectee: 20, tvaDeductible: 0, tvaNette: 20 });
  });

  it("getJournalVentes : seulement les écritures du journal VE", async () => {
    const reader = new FakeComptabiliteReader();
    reader.seedEcritures(1, [ec({ journal: "VE", numeroCompte: "411000" }), ec({ journal: "AC", numeroCompte: "401000" })]);
    const j = await getJournalVentes(reader, ctx(1), undefined, () => NOW);
    expect(j).toHaveLength(1);
    expect(j[0].journal).toBe("VE");
  });

  it("getDeclarationTVADetail : assemble parTaux + TVA déductible (arrondi)", async () => {
    const reader = new FakeComptabiliteReader();
    reader.seedDeclarationTVA(1, { parTaux: [{ taux: 20, baseHT: 100, tvaCollectee: 20 }], tvaDeductible: 8 });
    const d = await getDeclarationTVADetail(reader, ctx(1), undefined, () => NOW);
    expect(d).toEqual({ parTaux: [{ taux: 20, baseHT: 100, tvaCollectee: 20 }], tvaCollectee: 20, tvaDeductible: 8, tvaNette: 12 });
  });

  it("isolation : un autre tenant a ses propres écritures (vide ici)", async () => {
    const reader = new FakeComptabiliteReader();
    reader.seedEcritures(1, [ec({})]);
    expect(await getGrandLivre(reader, ctx(2), undefined, () => NOW)).toEqual([]);
  });

  it("getFecPreview : génère le FEC, projette 15 lignes + conformité équilibrée + siret", async () => {
    const reader = new FakeComptabiliteReader();
    reader.seedSiret(1, "11122233300044");
    reader.seedFecInput(1, {
      factures: [{ id: 1, numero: "FAC-1", dateFacture: new Date("2026-06-10"), totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", statut: "envoyee", datePaiement: null, typeDocument: "facture", clientId: 7, clientNom: "Durand", clientPrenom: "Jean", lignesTVA: [{ tauxTVA: "20", tva: "20.00" }] }],
      depenses: [],
      encaissements: [],
    });
    const prev = await getFecPreview(reader, ctx(1), undefined, () => NOW);
    expect(prev.siret).toBe("11122233300044");
    expect(prev.totalFactures).toBe(1);
    expect(prev.conformite.equilibre).toBe(true);
    expect(prev.lines).toHaveLength(3);
  });
});

import { describe, it, expect } from "vitest";
import { FakeEcritureRepository } from "./infra/ecriture-repository-fake";
import { FakeFactureReader } from "./infra/facture-reader-fake";
import { genererEcrituresVente, genererEcrituresEncaissement } from "./application/generation-use-cases";
import { balanceComptable, listEcritures, listEcrituresFacture, grandLivreComptable, genererExportFEC } from "./application/read-use-cases";
import { exporterFEC } from "./application/fec";
import type { EcritureComptable } from "./domain/ecriture";
import type { TenantContext } from "../../shared/tenant";
import type { FactureReadModel } from "./application/facture-reader";

// Revue de synthèse des invariants métier du domaine ecritures (compta/FEC — financier CRITIQUE).
const A: TenantContext = { artisanId: 1, userId: 50 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const facture = (over: Partial<FactureReadModel> = {}): FactureReadModel => ({
  id: 701, artisanId: 1, numero: "FAC-00001", dateFacture: new Date("2026-06-14T00:00:00Z"),
  typeDocument: "facture", statut: "payee", datePaiement: new Date("2026-06-20T00:00:00Z"),
  totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", ...over,
});

function equilibre(ecr: EcritureComptable[]): boolean {
  const d = ecr.reduce((s, e) => s + Number(e.debit), 0);
  const c = ecr.reduce((s, e) => s + Number(e.credit), 0);
  return Math.abs(d - c) < 0.005 && ecr.every((e) => Number(e.debit) >= 0 && Number(e.credit) >= 0);
}

describe("ecritures — invariants métier (synthèse)", () => {
  it("INV-1 : isolation cross-tenant (lecture → [] ; createMany artisanId forcé)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture());
    await genererEcrituresVente(repo, reader, A, 701);
    expect(await listEcritures(repo, B)).toEqual([]);
    expect(await listEcrituresFacture(repo, B, 701)).toEqual([]);
    expect(await balanceComptable(repo, B)).toEqual([]);
    expect(await grandLivreComptable(repo, B)).toEqual([]);
    expect((await listEcritures(repo, A)).every((e) => e.artisanId === 1)).toBe(true);
  });

  it("INV-2 : équilibre génération (vente ET encaissement : Σdébit=Σcrédit, montants ≥ 0)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    expect(equilibre(await genererEcrituresVente(repo, reader, A, 701))).toBe(true);
    expect(equilibre(await genererEcrituresEncaissement(repo, reader, A, 701))).toBe(true);
  });

  it("INV-3 : avoir = sens inversé (411 crédit / 706+445 débit), montants ≥ 0", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ typeDocument: "avoir", numero: "AV-00001", totalHT: "-100.00", totalTVA: "-20.00", totalTTC: "-120.00" }), [
      { tauxTVA: "20.00", montantTVA: "-20.00" },
    ]);
    const ecr = await genererEcrituresVente(repo, reader, A, 701);
    expect(ecr.find((e) => e.numeroCompte === "411000")!.credit).toBe("120.00");
    expect(ecr.find((e) => e.numeroCompte === "706000")!.debit).toBe("100.00");
    expect(equilibre(ecr)).toBe(true);
  });

  it("INV-4 : idempotence (vente 2 appels → 1 pièce ; encaissement régénère BQ sans toucher VE)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 701);
    await genererEcrituresVente(repo, reader, A, 701);
    await genererEcrituresEncaissement(repo, reader, A, 701);
    await genererEcrituresEncaissement(repo, reader, A, 701);
    const all = await listEcrituresFacture(repo, A, 701);
    expect(all.filter((e) => e.journal === "VE").length).toBe(3);
    expect(all.filter((e) => e.journal === "BQ").length).toBe(2);
  });

  it("INV-5 : balance Σsoldes=0 (ensemble VE+BQ équilibré)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 701);
    await genererEcrituresEncaissement(repo, reader, A, 701);
    const total = (await balanceComptable(repo, A)).reduce((s, l) => s + Number(l.solde), 0);
    expect(total).toBeCloseTo(0, 2);
  });

  it("INV-6 : FEC bien formé (18 colonnes, équilibre par pièce, dates YYYYMMDD)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 701);
    await genererEcrituresEncaissement(repo, reader, A, 701);
    const fec = exporterFEC(await listEcritures(repo, A));
    const lines = fec.split("\n");
    expect(lines[0].split("\t").length).toBe(18);
    for (const l of lines.slice(1)) expect(l.split("\t")[3]).toMatch(/^\d{8}$/); // EcritureDate
    // export via use-case (période) cohérent
    const fecResult = await genererExportFEC(repo, A, new Date("2026-06-01"), new Date("2026-06-30"));
    expect(fecResult.fec.split("\n").length).toBe(lines.length);
    expect(fecResult.conformite.equilibre).toBe(true);
  });

  it("INV-7 : encaissement conditionné (statut≠payee ou avoir [TTC≤0] → rien)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ statut: "envoyee" }));
    expect(await genererEcrituresEncaissement(repo, reader, A, 701)).toEqual([]);
    const reader2 = new FakeFactureReader();
    reader2.register(facture({ statut: "payee", typeDocument: "avoir", totalTTC: "-120.00" }));
    expect(await genererEcrituresEncaissement(repo, reader2, A, 701)).toEqual([]);
  });
});

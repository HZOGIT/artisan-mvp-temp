import { describe, it, expect } from "vitest";
import { FakeEcritureRepository } from "../infra/ecriture-repository-fake";
import { FakeFactureReader } from "../infra/facture-reader-fake";
import { genererEcrituresVente } from "./generation-use-cases";
import type { EcritureComptable } from "../domain/ecriture";
import type { TenantContext } from "../../../shared/tenant";
import type { FactureReadModel } from "./facture-reader";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

const facture = (over: Partial<FactureReadModel> = {}): FactureReadModel => ({
  id: 501, artisanId: 1, numero: "FAC-00001", dateFacture: new Date("2026-06-14T00:00:00Z"),
  typeDocument: "facture", totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00", ...over,
});

// Invariant FEC : Σ débit = Σ crédit, et aucun montant négatif.
function assertEquilibre(ecr: EcritureComptable[]): void {
  const d = ecr.reduce((s, e) => s + Number(e.debit), 0);
  const c = ecr.reduce((s, e) => s + Number(e.credit), 0);
  expect(d).toBeCloseTo(c, 2);
  expect(ecr.every((e) => Number(e.debit) >= 0 && Number(e.credit) >= 0)).toBe(true);
}

describe("ecritures — génération écritures de VENTE (FEC)", () => {
  it("facture : 411 débit TTC / 706 crédit HT / 445 crédit TVA ; Σdébit=Σcrédit", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.length).toBe(3);
    const c411 = ecr.find((e) => e.numeroCompte === "411000")!;
    const c706 = ecr.find((e) => e.numeroCompte === "706000")!;
    const cTva = ecr.find((e) => e.numeroCompte === "445711")!;
    expect(c411.debit).toBe("120.00");
    expect(c706.credit).toBe("100.00");
    expect(cTva.credit).toBe("20.00");
    assertEquilibre(ecr);
  });

  it("avoir : sens inversé (411 crédit / 706+445 débit), montants positifs ; Σdébit=Σcrédit", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ typeDocument: "avoir", totalHT: "-100.00", totalTVA: "-20.00", totalTTC: "-120.00", numero: "AV-00001" }), [
      { tauxTVA: "20.00", montantTVA: "-20.00" },
    ]);
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.find((e) => e.numeroCompte === "411000")!.credit).toBe("120.00");
    expect(ecr.find((e) => e.numeroCompte === "706000")!.debit).toBe("100.00");
    expect(ecr.find((e) => e.numeroCompte === "445711")!.debit).toBe("20.00");
    assertEquilibre(ecr);
  });

  it("TVA ventilée par taux (20% + 10%) ; Σdébit=Σcrédit", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    // HT 200 (100@20% + 100@10%) → TVA 30 (20 + 10), TTC 230.
    reader.register(facture({ totalHT: "200.00", totalTVA: "30.00", totalTTC: "230.00" }), [
      { tauxTVA: "20.00", montantTVA: "20.00" },
      { tauxTVA: "10.00", montantTVA: "10.00" },
    ]);
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.find((e) => e.numeroCompte === "445711")!.credit).toBe("20.00");
    expect(ecr.find((e) => e.numeroCompte === "445712")!.credit).toBe("10.00");
    assertEquilibre(ecr);
  });

  it("TVA = 0 : seulement 411 + 706 ; Σdébit=Σcrédit (TTC = HT)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ totalTVA: "0.00", totalTTC: "100.00" }), []);
    const ecr = await genererEcrituresVente(repo, reader, A, 501);
    expect(ecr.length).toBe(2);
    assertEquilibre(ecr);
  });

  it("idempotence : 2 appels → une seule pièce en base (purge avant insert)", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture(), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    await genererEcrituresVente(repo, reader, A, 501);
    await genererEcrituresVente(repo, reader, A, 501);
    expect((await repo.listByFacture(A, 501)).length).toBe(3); // pas 6
  });

  it("facture hors tenant → aucune écriture générée", async () => {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(facture({ artisanId: 1 }), [{ tauxTVA: "20.00", montantTVA: "20.00" }]);
    expect(await genererEcrituresVente(repo, reader, B, 501)).toEqual([]);
    expect((await repo.list(B))).toEqual([]);
  });
});

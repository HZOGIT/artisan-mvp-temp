import { describe, it, expect } from "vitest";
import { FakeEcritureRepository } from "./ecriture-repository-fake";
import { FakeFactureReader } from "./facture-reader-fake";
import { ComptaEcrituresAdapter } from "./compta-ecritures-adapter";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };

// L'adapter implémente le ComptaPort des factures en déléguant aux use-cases de génération FEC.
describe("ecritures — ComptaEcrituresAdapter (seam ComptaPort)", () => {
  function setup() {
    const repo = new FakeEcritureRepository();
    const reader = new FakeFactureReader();
    reader.register(
      {
        id: 501, artisanId: 1, numero: "FAC-00001", dateFacture: new Date("2026-06-14T00:00:00Z"),
        typeDocument: "facture", statut: "payee", datePaiement: new Date("2026-06-20T00:00:00Z"),
        totalHT: "100.00", totalTVA: "20.00", totalTTC: "120.00",
      },
      [{ tauxTVA: "20.00", montantTVA: "20.00" }],
    );
    return { repo, adapter: new ComptaEcrituresAdapter(repo, reader) };
  }

  it("genererEcrituresVente délègue → pièce VE en base (411/706/445)", async () => {
    const { repo, adapter } = setup();
    await adapter.genererEcrituresVente(A, 501);
    const ve = (await repo.listByFacture(A, 501)).filter((e) => e.journal === "VE");
    expect(ve.length).toBe(3);
  });

  it("genererEcrituresEncaissement délègue → pièce BQ en base (512/411)", async () => {
    const { repo, adapter } = setup();
    await adapter.genererEcrituresEncaissement(A, 501);
    const bq = (await repo.listByFacture(A, 501)).filter((e) => e.journal === "BQ");
    expect(bq.length).toBe(2);
  });

  it("vente puis encaissement coexistent (idempotence sélective par journal)", async () => {
    const { repo, adapter } = setup();
    await adapter.genererEcrituresVente(A, 501);
    await adapter.genererEcrituresEncaissement(A, 501);
    await adapter.genererEcrituresEncaissement(A, 501); // régénère BQ sans toucher VE
    const all = await repo.listByFacture(A, 501);
    expect(all.filter((e) => e.journal === "VE").length).toBe(3);
    expect(all.filter((e) => e.journal === "BQ").length).toBe(2);
  });

  it("validerEcritures → toutes les écritures passent en statut validée (OPE-753)", async () => {
    const { repo, adapter } = setup();
    await adapter.genererEcrituresVente(A, 501);
    await adapter.genererEcrituresEncaissement(A, 501);
    expect(await repo.hasValidatedEcritures(A, 501)).toBe(false);
    await adapter.validerEcritures(A, 501);
    expect(await repo.hasValidatedEcritures(A, 501)).toBe(true);
    const all = await repo.listByFacture(A, 501);
    expect(all.every((e) => e.statut === "validee")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { calculerNouveauMontant, reviserPrixContrat } from "./revision-use-cases";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import type { TenantContext } from "../../../shared/tenant";

const ctx: TenantContext = { artisanId: 1, userId: 1 };

describe("calculerNouveauMontant (L1 — pur)", () => {
  it("applique le taux et arrondit à 2 décimales", () => {
    expect(calculerNouveauMontant("300.00", "2")).toBe("306.00");
    expect(calculerNouveauMontant("100.00", "2.5")).toBe("102.50");
    expect(calculerNouveauMontant("100.01", "3")).toBe("103.01");
  });

  it("arrondit correctement les cas à virgule flottante", () => {
    expect(calculerNouveauMontant("199.99", "2")).toBe("203.99");
    expect(calculerNouveauMontant("333.33", "1.5")).toBe("338.33");
  });
});

describe("reviserPrixContrat (L1 — fake repo)", () => {
  function makeRepo() {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 10);
    return repo;
  }

  it("révise le prix et retourne ancienMontant + nouveauMontant", async () => {
    const repo = makeRepo();
    const contrat = await repo.create(ctx, { clientId: 10, titre: "T", montantHT: "300.00", periodicite: "annuel", dateDebut: new Date(), tauxIndexationAnnuel: "2" }, "CTR-00001");
    const result = await reviserPrixContrat(repo, ctx, contrat.id);
    expect(result.ancienMontantHT).toBe("300.00");
    expect(result.nouveauMontantHT).toBe("306.00");
    expect(result.contrat.montantHT).toBe("306.00");
    expect(result.contrat.dateDerniereRevision).toBeInstanceOf(Date);
  });

  it("rejette si aucun taux défini", async () => {
    const repo = makeRepo();
    const contrat = await repo.create(ctx, { clientId: 10, titre: "T", montantHT: "300.00", periodicite: "annuel", dateDebut: new Date() }, "CTR-00001");
    await expect(reviserPrixContrat(repo, ctx, contrat.id)).rejects.toThrow("taux d'indexation");
  });

  it("rejette une 2e révision dans la même année (idempotence)", async () => {
    const repo = makeRepo();
    const contrat = await repo.create(ctx, { clientId: 10, titre: "T", montantHT: "300.00", periodicite: "annuel", dateDebut: new Date(), tauxIndexationAnnuel: "2" }, "CTR-00001");
    await reviserPrixContrat(repo, ctx, contrat.id);
    await expect(reviserPrixContrat(repo, ctx, contrat.id)).rejects.toThrow("déjà été révisé cette année");
  });

  it("accepte une révision si la dernière remonte à l'an passé", async () => {
    const repo = makeRepo();
    const contrat = await repo.create(ctx, { clientId: 10, titre: "T", montantHT: "300.00", periodicite: "annuel", dateDebut: new Date(), tauxIndexationAnnuel: "2" }, "CTR-00001");
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    await repo.reviserPrix(ctx, contrat.id, "300.00", lastYear);
    const result = await reviserPrixContrat(repo, ctx, contrat.id);
    expect(result.nouveauMontantHT).toBe("306.00");
  });
});

import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { autoGenererFacturesContrats } from "./auto-facturation-use-cases";
import { ConflictError } from "../../../shared/errors";
import type { ContratFactureGenerator, GenererFactureContratInput, FactureGenereeRef } from "./contrat-facture-generator";
import type { TenantContext } from "../../../shared/tenant";

class FakeFactureGen implements ContratFactureGenerator {
  generated: GenererFactureContratInput[] = [];
  /** Injecter une erreur pour le prochain appel (null = succès). */
  nextError: Error | null = null;
  private seq = 0;

  async genererFactureEmise(_ctx: TenantContext, input: GenererFactureContratInput): Promise<FactureGenereeRef> {
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    this.generated.push(input);
    return { id: ++this.seq, numero: `F-${String(this.seq).padStart(5, "0")}` };
  }
}

const base = (over = {}) => ({
  clientId: 100,
  titre: "Entretien",
  montantHT: "200.00",
  tauxTVA: "20.00",
  periodicite: "mensuel" as const,
  dateDebut: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("autoGenererFacturesContrats", () => {
  it("aucun contrat dû → generees: 0, erreurs: 0", async () => {
    const repo = new FakeContratRepository();
    const gen = new FakeFactureGen();
    const result = await autoGenererFacturesContrats(repo, gen, [1], new Date("2026-06-27T12:00:00Z"));
    expect(result).toEqual({ generees: 0, erreurs: 0 });
    expect(gen.generated).toHaveLength(0);
  });

  it("1 contrat dû → generees: 1, facture émise", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100, "Dupont");
    await repo.create({ artisanId: 1 }, base({ prochainFacturation: new Date("2026-06-26T00:00:00Z") }), "CTR-00001");
    const gen = new FakeFactureGen();
    const result = await autoGenererFacturesContrats(repo, gen, [1], new Date("2026-06-27T12:00:00Z"));
    expect(result).toEqual({ generees: 1, erreurs: 0 });
    expect(gen.generated).toHaveLength(1);
  });

  it("ConflictError swallowée → pas comptée comme erreur", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100, "Dupont");
    await repo.create({ artisanId: 1 }, base({ prochainFacturation: new Date("2026-06-26T00:00:00Z") }), "CTR-00001");
    const gen = new FakeFactureGen();
    gen.nextError = new ConflictError("déjà facturé");
    const result = await autoGenererFacturesContrats(repo, gen, [1], new Date("2026-06-27T12:00:00Z"));
    expect(result).toEqual({ generees: 0, erreurs: 0 });
  });

  it("chemin cron → facture récurrente enregistrée avec genereeAutomatiquement: true", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100, "Dupont");
    await repo.create({ artisanId: 1 }, base({ prochainFacturation: new Date("2026-06-26T00:00:00Z") }), "CTR-00001");
    const gen = new FakeFactureGen();
    await autoGenererFacturesContrats(repo, gen, [1], new Date("2026-06-27T12:00:00Z"));
    expect(repo.facturesRecurrentes).toHaveLength(1);
    expect(repo.facturesRecurrentes[0].genereeAutomatiquement).toBe(true);
  });

  it("2 artisans × 1 contrat dû chacun → generees: 2", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100, "Dupont");
    repo.seedClient(2, 200, "Martin");
    await repo.create({ artisanId: 1 }, base({ clientId: 100, prochainFacturation: new Date("2026-06-26T00:00:00Z") }), "CTR-00001");
    await repo.create({ artisanId: 2 }, base({ clientId: 200, prochainFacturation: new Date("2026-06-25T00:00:00Z") }), "CTR-00002");
    const gen = new FakeFactureGen();
    const result = await autoGenererFacturesContrats(repo, gen, [1, 2], new Date("2026-06-27T12:00:00Z"));
    expect(result).toEqual({ generees: 2, erreurs: 0 });
  });
});

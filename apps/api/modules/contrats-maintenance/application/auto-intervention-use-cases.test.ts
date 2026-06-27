import { describe, it, expect } from "vitest";
import { FakeContratRepository } from "../infra/contrat-repository-fake";
import { autoGenererInterventionsContrats } from "./auto-intervention-use-cases";

const base = (over = {}) => ({
  clientId: 100,
  titre: "Entretien",
  montantHT: "200.00",
  tauxTVA: "20.00",
  periodicite: "mensuel" as const,
  dateDebut: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("autoGenererInterventionsContrats", () => {
  it("aucun contrat dû → generees: 0, erreurs: 0", async () => {
    const repo = new FakeContratRepository();
    const result = await autoGenererInterventionsContrats(repo, [1], new Date("2026-06-27T12:00:00Z"));
    expect(result).toEqual({ generees: 0, erreurs: 0 });
  });

  it("1 contrat actif dû → generees: 1, intervention créée", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100, "Dupont");
    const contrat = await repo.create(
      { artisanId: 1 },
      base({ statut: "actif", prochainPassage: new Date("2026-06-26T00:00:00Z") }),
      "CTR-00001"
    );
    const result = await autoGenererInterventionsContrats(repo, [1], new Date("2026-06-27T12:00:00Z"));
    expect(result).toEqual({ generees: 1, erreurs: 0 });
    const interventions = await repo.listInterventions({ artisanId: 1, userId: 0 }, contrat.id);
    expect(interventions).toHaveLength(1);
  });

  it("contrat suspendu → ignoré", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100, "Dupont");
    const contrat = await repo.create(
      { artisanId: 1 },
      base({ prochainPassage: new Date("2026-06-26T00:00:00Z") }),
      "CTR-00001"
    );
    await repo.setStatut({ artisanId: 1, userId: 0 }, contrat.id, "suspendu");
    const result = await autoGenererInterventionsContrats(repo, [1], new Date("2026-06-27T12:00:00Z"));
    expect(result).toEqual({ generees: 0, erreurs: 0 });
  });

  it("1 contrat dû → prochainPassage avancé selon périodicité", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100, "Dupont");
    const contrat = await repo.create(
      { artisanId: 1 },
      base({ statut: "actif", prochainPassage: new Date("2026-06-26T00:00:00Z") }),
      "CTR-00001"
    );
    await autoGenererInterventionsContrats(repo, [1], new Date("2026-06-27T12:00:00Z"));
    const updated = await repo.getById({ artisanId: 1, userId: 0 }, contrat.id);
    expect(updated?.prochainPassage).toEqual(new Date("2026-07-26T00:00:00Z"));
  });

  it("2 artisans × 1 contrat dû chacun → generees: 2", async () => {
    const repo = new FakeContratRepository();
    repo.seedClient(1, 100, "Dupont");
    repo.seedClient(2, 200, "Martin");
    await repo.create(
      { artisanId: 1 },
      base({ clientId: 100, statut: "actif", prochainPassage: new Date("2026-06-26T00:00:00Z") }),
      "CTR-00001"
    );
    await repo.create(
      { artisanId: 2 },
      base({ clientId: 200, statut: "actif", prochainPassage: new Date("2026-06-25T00:00:00Z") }),
      "CTR-00002"
    );
    const result = await autoGenererInterventionsContrats(repo, [1, 2], new Date("2026-06-27T12:00:00Z"));
    expect(result).toEqual({ generees: 2, erreurs: 0 });
  });
});

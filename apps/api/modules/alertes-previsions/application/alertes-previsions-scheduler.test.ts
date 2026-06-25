import { describe, it, expect } from "vitest";
import type { AlerteConfig } from "../domain/alerte-prevision";
import { AlertesPrevisionsRepositoryFake } from "../infra/alertes-previsions-repository-fake";
import { runAlertesSchedulerTick } from "./alertes-previsions-scheduler";

const actif: AlerteConfig = {
  seuilAlertePositif: "10.00", seuilAlerteNegatif: "10.00", alerteEmail: true, alerteSms: false,
  emailDestination: "a@b.fr", telephoneDestination: null, frequenceVerification: "hebdomadaire", actif: true,
};

const NOW = new Date("2026-06-15T12:00:00Z");

describe("runAlertesSchedulerTick", () => {
  it("aucun artisanId → processed=0 errors=0", async () => {
    const result = await runAlertesSchedulerTick(new AlertesPrevisionsRepositoryFake(), [], NOW);
    expect(result).toEqual({ processed: 0, errors: 0 });
  });

  it("traite N artisanIds sans erreur → processed=N errors=0", async () => {
    const repo = new AlertesPrevisionsRepositoryFake({ config: actif, previsionCA: 1000, caRealise: 1300 });
    const result = await runAlertesSchedulerTick(repo, [1, 2, 3], NOW);
    expect(result.processed).toBe(3);
    expect(result.errors).toBe(0);
  });

  it("erreur sur un artisan → errors++ mais boucle continue", async () => {
    const repo = new class extends AlertesPrevisionsRepositoryFake {
      override async getCaRealiseMois() { throw new Error("DB down"); }
    }({ config: actif, previsionCA: 1000 });
    const result = await runAlertesSchedulerTick(repo, [1], NOW);
    expect(result.errors).toBe(1);
    expect(result.processed).toBe(0);
  });

  it("mix succès + erreur → compteurs corrects", async () => {
    let call = 0;
    const repo = new class extends AlertesPrevisionsRepositoryFake {
      override async getCaRealiseMois() {
        if (++call === 2) throw new Error("flaky");
        return 1300;
      }
    }({ config: actif, previsionCA: 1000 });
    const result = await runAlertesSchedulerTick(repo, [1, 2, 3], NOW);
    expect(result.processed).toBe(2);
    expect(result.errors).toBe(1);
  });
});

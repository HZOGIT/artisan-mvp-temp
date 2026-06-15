import { describe, it, expect } from "vitest";
import { InterventionMobileRepositoryFake } from "./infra/intervention-mobile-repository-fake";
import { createInterventionsMobileModule } from "./interventions-mobile.module";

describe("createInterventionsMobileModule", () => {
  it("assemble un router avec getTodayInterventions/startIntervention/endIntervention", () => {
    const mod = createInterventionsMobileModule({
      interventions: { listJour: async () => [], getById: async () => null, update: async () => null },
      clients: { getById: async () => null },
      techniciens: { list: async () => [] },
      mobile: new InterventionMobileRepositoryFake(),
    });
    const r = mod.router as Record<string, unknown>;
    for (const k of ["getTodayInterventions", "startIntervention", "endIntervention"]) {
      expect(typeof r[k]).not.toBe("undefined");
    }
  });
});

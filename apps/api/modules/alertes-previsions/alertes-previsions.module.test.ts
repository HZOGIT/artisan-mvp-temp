import { describe, it, expect } from "vitest";
import { AlertesPrevisionsRepositoryFake } from "./infra/alertes-previsions-repository-fake";
import { createAlertesPrevisionsModule } from "./alertes-previsions.module";

describe("createAlertesPrevisionsModule", () => {
  it("assemble un router avec getConfig/saveConfig/getHistorique/verifierEtEnvoyer", () => {
    const mod = createAlertesPrevisionsModule({ repo: new AlertesPrevisionsRepositoryFake() });
    const r = mod.router as Record<string, unknown>;
    for (const k of ["getConfig", "saveConfig", "getHistorique", "verifierEtEnvoyer"]) {
      expect(typeof r[k]).not.toBe("undefined");
    }
  });
});

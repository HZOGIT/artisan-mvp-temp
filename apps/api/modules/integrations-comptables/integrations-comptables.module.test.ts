import { describe, it, expect } from "vitest";
import { IntegrationsComptablesRepositoryFake } from "./infra/integrations-comptables-repository-fake";
import { createIntegrationsComptablesModule } from "./integrations-comptables.module";

describe("createIntegrationsComptablesModule", () => {
  it("assemble un router avec les 10 procédures", () => {
    const mod = createIntegrationsComptablesModule({ repo: new IntegrationsComptablesRepositoryFake(), fec: { getFecContent: async () => "" } });
    const r = mod.router as Record<string, unknown>;
    for (const k of ["getConfig", "saveConfig", "saveSyncConfig", "getSyncStatus", "getExports", "genererExport", "getSyncLogs", "getPendingItems", "lancerSync", "retrySync"]) {
      expect(typeof r[k]).not.toBe("undefined");
    }
  });
});

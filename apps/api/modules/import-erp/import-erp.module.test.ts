import { describe, it, expect } from "vitest";
import { ImportErpRepositoryFake } from "./infra/import-erp-repository-fake";
import { createImportErpModule } from "./import-erp.module";

describe("createImportErpModule", () => {
  it("assemble un router avec importClients/importDevis/importFactures", () => {
    const mod = createImportErpModule({ repo: new ImportErpRepositoryFake() });
    const r = mod.router as Record<string, unknown>;
    for (const k of ["importClients", "importDevis", "importFactures"]) {
      expect(typeof r[k]).not.toBe("undefined");
    }
  });
});

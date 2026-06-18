import { describe, it, expect } from "vitest";
import { createDevisOptionsModule } from "./devis-options.module";
import { FakeDevisOptionRepository } from "./infra/devis-option-repository-fake";

describe("devis-options.module", () => {
  it("createDevisOptionsModule câble le repository injecté", () => {
    const repo = new FakeDevisOptionRepository();
    const module = createDevisOptionsModule({ repository: repo });
    expect(module.deps.repository).toBe(repo);
  });

  it("expose le routeur tRPC (surface client : getByDevisId/create/delete/select/convertirEnDevis)", () => {
    const module = createDevisOptionsModule({ repository: new FakeDevisOptionRepository() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["convertirEnDevis", "create", "delete", "getByDevisId", "select"]);
  });
});

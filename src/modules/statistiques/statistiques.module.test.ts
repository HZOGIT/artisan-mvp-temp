import { describe, it, expect } from "vitest";
import { createStatistiquesModule } from "./statistiques.module";
import { FakeDevisStatsReader } from "./infra/devis-stats-reader-fake";

describe("statistiques.module", () => {
  it("createStatistiquesModule câble le reader injecté", () => {
    const reader = new FakeDevisStatsReader();
    const module = createStatistiquesModule({ devisStatsReader: reader });
    expect(module.deps.devisStatsReader).toBe(reader);
  });

  it("expose le routeur tRPC (getDevisStats)", () => {
    const module = createStatistiquesModule({ devisStatsReader: new FakeDevisStatsReader() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["getDevisStats"]);
  });
});

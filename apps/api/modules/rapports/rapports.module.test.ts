import { describe, it, expect } from "vitest";
import { createRapportsModule } from "./rapports.module";
import { FakeRapportRepository } from "./infra/rapport-repository-fake";

describe("rapports.module", () => {
  it("createRapportsModule câble le repository injecté", () => {
    const repo = new FakeRapportRepository();
    const module = createRapportsModule({ repository: repo });
    expect(module.deps.repository).toBe(repo);
  });

  it("expose le routeur tRPC (surface client)", () => {
    const module = createRapportsModule({ repository: new FakeRapportRepository() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["create", "delete", "executer", "list", "toggleFavori"]);
  });
});

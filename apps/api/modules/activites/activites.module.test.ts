import { describe, it, expect } from "vitest";
import { createActivitesModule } from "./activites.module";
import { FakeActiviteRepository } from "./infra/activite-repository-fake";

describe("activites.module", () => {
  it("createActivitesModule câble le repository injecté", () => {
    const repo = new FakeActiviteRepository();
    const module = createActivitesModule({ repository: repo });
    expect(module.deps.repository).toBe(repo);
  });

  it("expose le routeur tRPC (surface client : list/create/toggleFait/delete)", () => {
    const module = createActivitesModule({ repository: new FakeActiviteRepository() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["create", "delete", "list", "toggleFait"]);
  });
});

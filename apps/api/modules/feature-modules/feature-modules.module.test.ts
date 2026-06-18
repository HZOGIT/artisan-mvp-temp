import { describe, it, expect } from "vitest";
import { createFeatureModulesModule } from "./feature-modules.module";
import { FakeModulesRepository } from "./infra/modules-repository-fake";

describe("feature-modules.module", () => {
  it("createFeatureModulesModule câble le repository injecté", () => {
    const repo = new FakeModulesRepository();
    const module = createFeatureModulesModule({ repository: repo });
    expect(module.deps.repository).toBe(repo);
  });

  it("expose le routeur tRPC (surface client)", () => {
    const module = createFeatureModulesModule({ repository: new FakeModulesRepository() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["completeOnboarding", "getMine", "getOnboardingStatus", "list", "skipOnboarding", "toggle"]);
  });
});

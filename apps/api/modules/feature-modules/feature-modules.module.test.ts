import { describe, it, expect } from "vitest";
import { createFeatureModulesModule } from "./feature-modules.module";
import { FakeModulesRepository } from "./infra/modules-repository-fake";
import { FakeSubscriptionReader } from "../subscription/infra/subscription-reader-fake";

describe("feature-modules.module", () => {
  it("createFeatureModulesModule câble le repository injecté", () => {
    const repo = new FakeModulesRepository();
    const reader = new FakeSubscriptionReader();
    const module = createFeatureModulesModule({ repository: repo, subscriptionReader: reader });
    expect(module.deps.repository).toBe(repo);
    expect(module.deps.subscriptionReader).toBe(reader);
  });

  it("expose le routeur tRPC (surface client)", () => {
    const module = createFeatureModulesModule({ repository: new FakeModulesRepository(), subscriptionReader: new FakeSubscriptionReader() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["completeOnboarding", "getMine", "getOnboardingStatus", "list", "skipOnboarding", "toggle"]);
  });
});

import type { IModulesRepository } from "./application/modules-repository";
import type { ISubscriptionReader } from "../subscription/application/subscription-reader";
import { createModulesRouter } from "./interface/trpc/modules.router";

/** Wiring DI du module « modules » (catalogue de fonctionnalités + onboarding). */
export interface FeatureModulesModuleDeps {
  readonly repository: IModulesRepository;
  readonly subscriptionReader: ISubscriptionReader;
}

export interface FeatureModulesModule {
  readonly deps: FeatureModulesModuleDeps;
  readonly router: ReturnType<typeof createModulesRouter>;
}

export function createFeatureModulesModule(deps: FeatureModulesModuleDeps): FeatureModulesModule {
  return { deps, router: createModulesRouter(deps.repository, deps.subscriptionReader) };
}

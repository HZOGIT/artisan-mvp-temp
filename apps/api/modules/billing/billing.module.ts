import type { IBillingRepository } from "./application/billing-repository";
import type { BillingDeps } from "./application/billing-use-cases";
import { createBillingRouter } from "./interface/trpc/billing.router";

export interface BillingModuleDeps {
  readonly repo: IBillingRepository;
  readonly deps: BillingDeps;
}

export interface BillingModule {
  readonly router: ReturnType<typeof createBillingRouter>;
}

export function createBillingModule(moduleDeps: BillingModuleDeps): BillingModule {
  return { router: createBillingRouter(moduleDeps.deps) };
}

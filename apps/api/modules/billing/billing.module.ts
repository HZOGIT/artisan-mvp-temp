import type { IBillingRepository } from "./application/billing-repository";
import type { BillingDeps } from "./application/billing-use-cases";
import type { PdfPort } from "../../shared/ports/pdf";
import type { StoragePort } from "../../shared/ports/storage";
import { createBillingRouter } from "./interface/trpc/billing.router";

export interface BillingModuleDeps {
  readonly repo: IBillingRepository;
  readonly deps: BillingDeps;
  readonly pdf?: PdfPort;
  readonly storage?: StoragePort;
}

export interface BillingModule {
  readonly router: ReturnType<typeof createBillingRouter>;
}

export function createBillingModule(moduleDeps: BillingModuleDeps): BillingModule {
  const deps: BillingDeps = {
    ...moduleDeps.deps,
    pdf: moduleDeps.pdf,
    storage: moduleDeps.storage,
  };
  return { router: createBillingRouter(deps) };
}

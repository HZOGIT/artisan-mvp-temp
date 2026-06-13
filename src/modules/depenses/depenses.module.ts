import type { IDepenseRepository } from "./application/depense-repository";
import { createDepensesRouter } from "./interface/trpc/depenses.router";

// Wiring DI du module depenses : assemble le routeur tRPC à partir du repository injecté.
export interface DepensesModuleDeps {
  readonly repository: IDepenseRepository;
}

export interface DepensesModule {
  readonly deps: DepensesModuleDeps;
  readonly router: ReturnType<typeof createDepensesRouter>;
}

export function createDepensesModule(deps: DepensesModuleDeps): DepensesModule {
  return { deps, router: createDepensesRouter(deps.repository) };
}

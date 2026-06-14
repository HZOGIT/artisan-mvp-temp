import type { IPrevisionCARepository } from "./application/prevision-ca-repository";
import { createPrevisionsCARouter } from "./interface/trpc/previsions-ca.router";

// Wiring DI du module previsions-ca : assemble le routeur tRPC (CRUD catalogue + byAnnee) à partir du
// repository injecté.
export interface PrevisionsCAModuleDeps {
  readonly repository: IPrevisionCARepository;
}

export interface PrevisionsCAModule {
  readonly deps: PrevisionsCAModuleDeps;
  readonly router: ReturnType<typeof createPrevisionsCARouter>;
}

export function createPrevisionsCAModule(deps: PrevisionsCAModuleDeps): PrevisionsCAModule {
  return { deps, router: createPrevisionsCARouter(deps.repository) };
}

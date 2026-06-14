import type { IPrevisionCARepository } from "./application/prevision-ca-repository";

// Wiring DI du module previsions-ca. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface PrevisionsCAModuleDeps {
  readonly repository: IPrevisionCARepository;
}

export interface PrevisionsCAModule {
  readonly deps: PrevisionsCAModuleDeps;
}

export function createPrevisionsCAModule(deps: PrevisionsCAModuleDeps): PrevisionsCAModule {
  return { deps };
}

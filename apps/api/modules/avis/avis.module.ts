import type { IAvisRepository } from "./application/avis-repository";
import type { DemandeAvisDeps } from "./application/demande-avis-use-cases";
import type { AvisPublicDeps } from "./application/avis-public-use-cases";
import { createAvisRouter } from "./interface/trpc/avis.router";

/*
 * Wiring DI du module avis : assemble le routeur tRPC à partir de toutes les
 * dépendances du domaine (repository de lecture/écriture + workflow demande d'avis +
 * surface publique par token). Découple `app.ts`/`createAppRouter` des détails d'instanciation.
 */
export interface AvisModuleDeps {
  readonly avisRepo: IAvisRepository;
  readonly demande: DemandeAvisDeps;
  readonly public: AvisPublicDeps;
}

export interface AvisModule {
  readonly deps: AvisModuleDeps;
  readonly router: ReturnType<typeof createAvisRouter>;
}

export function createAvisModule(deps: AvisModuleDeps): AvisModule {
  return { deps, router: createAvisRouter(deps.avisRepo, deps.demande, deps.public) };
}

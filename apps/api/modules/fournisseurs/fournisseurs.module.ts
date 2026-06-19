import type { IFournisseurRepository } from "./application/fournisseur-repository";
import { createFournisseursRouter } from "./interface/trpc/fournisseurs.router";

/*
 * Wiring DI du module fournisseurs : assemble le routeur tRPC à partir du repository
 * injecté. Découple `app.ts`/`createAppRouter` des détails d'instanciation.
 */
export interface FournisseursModuleDeps {
  readonly repository: IFournisseurRepository;
}

export interface FournisseursModule {
  readonly deps: FournisseursModuleDeps;
  readonly router: ReturnType<typeof createFournisseursRouter>;
}

export function createFournisseursModule(deps: FournisseursModuleDeps): FournisseursModule {
  return { deps, router: createFournisseursRouter(deps.repository) };
}

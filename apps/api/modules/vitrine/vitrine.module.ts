import { createVitrineRouter, type VitrineRouterDeps } from "./interface/trpc/vitrine.router";

/*
 * Wiring DI du module « vitrine » (site public de l'artisan). Surface PUBLIQUE par slug : lecture
 * agrégée + formulaire de contact. (Procédures admin de gestion des leads = seconde slice.)
 */
export interface VitrineModuleDeps extends VitrineRouterDeps {}

export interface VitrineModule {
  readonly deps: VitrineModuleDeps;
  readonly router: ReturnType<typeof createVitrineRouter>;
}

export function createVitrineModule(deps: VitrineModuleDeps): VitrineModule {
  return { deps, router: createVitrineRouter(deps) };
}

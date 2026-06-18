import { createDevisIARouter, type DevisIARouterDeps } from "./interface/trpc/devis-ia.router";

// Wiring DI du module « devisIA » (analyse photos chantier + génération devis IA). Compose le repo
// Drizzle + VisionPort + ArtisanReader (métier) + rate-limiter IA + bibliothèque (match articles).
export interface DevisIAModuleDeps extends DevisIARouterDeps {}

export interface DevisIAModule {
  readonly deps: DevisIAModuleDeps;
  readonly router: ReturnType<typeof createDevisIARouter>;
}

export function createDevisIAModule(deps: DevisIAModuleDeps): DevisIAModule {
  return { deps, router: createDevisIARouter(deps) };
}

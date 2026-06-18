import type { SupportDeps } from "./application/use-cases";
import { createSupportRouter } from "./interface/trpc/support.router";

// Wiring DI du module « support » (formulaire de contact → email). Sans table : dépend de l'EmailPort,
// d'un rate-limiter (anti-flood) et de la boîte support destinataire.
export interface SupportModuleDeps extends SupportDeps {}

export interface SupportModule {
  readonly deps: SupportModuleDeps;
  readonly router: ReturnType<typeof createSupportRouter>;
}

export function createSupportModule(deps: SupportModuleDeps): SupportModule {
  return { deps, router: createSupportRouter(deps) };
}

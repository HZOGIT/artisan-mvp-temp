import { createClientPortalRouter, type ClientPortalRouterDeps } from "./interface/trpc/client-portal.router";

/** Wiring DI du module « clientPortal » (espace client : admin par cookie artisan + public par token). */
export interface ClientPortalModuleDeps extends ClientPortalRouterDeps {}

export interface ClientPortalModule {
  readonly deps: ClientPortalModuleDeps;
  readonly router: ReturnType<typeof createClientPortalRouter>;
}

export function createClientPortalModule(deps: ClientPortalModuleDeps): ClientPortalModule {
  return { deps, router: createClientPortalRouter(deps) };
}

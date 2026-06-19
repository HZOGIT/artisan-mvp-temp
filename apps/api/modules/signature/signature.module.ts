import type { SignatureDeps } from "./application/use-cases";
import type { SignaturePublicDeps } from "./application/public-use-cases";
import { createSignatureRouter } from "./interface/trpc/signature.router";

/*
 * Wiring DI du module signature : assemble le routeur tRPC à partir des dépendances du domaine.
 * - `deps` (surface ARTISAN protégée) : repo `signatures_devis` HORS RLS + lecture contexte devis
 *   sous RLS + EmailPort + notifications.
 * - `publicDeps` (surface PUBLIQUE par token) : reader public (résolution token→devis sous RLS
 *   public-token, puis lecture sous le tenant résolu).
 */
export interface SignatureModuleDeps {
  readonly protectedDeps: SignatureDeps;
  readonly publicDeps: SignaturePublicDeps;
}

export interface SignatureModule {
  readonly deps: SignatureModuleDeps;
  readonly router: ReturnType<typeof createSignatureRouter>;
}

export function createSignatureModule(deps: SignatureModuleDeps): SignatureModule {
  return { deps, router: createSignatureRouter(deps.protectedDeps, deps.publicDeps) };
}

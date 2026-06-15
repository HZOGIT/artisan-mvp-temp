import type { SignatureDeps } from "./application/use-cases";
import { createSignatureRouter } from "./interface/trpc/signature.router";

// Wiring DI du module signature : assemble le routeur tRPC à partir des dépendances du domaine
// (repo signatures_devis HORS RLS + lecture contexte devis sous RLS + EmailPort + notifications).
export interface SignatureModule {
  readonly deps: SignatureDeps;
  readonly router: ReturnType<typeof createSignatureRouter>;
}

export function createSignatureModule(deps: SignatureDeps): SignatureModule {
  return { deps, router: createSignatureRouter(deps) };
}

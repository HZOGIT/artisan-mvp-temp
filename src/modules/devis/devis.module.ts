import type { IDevisRepository } from "./application/devis-repository";
import type { DevisMailingDeps } from "./application/envoyer-devis-email";
import type { DevisToFactureConverter } from "./application/devis-to-facture-converter";
import { createDevisRouter } from "./interface/trpc/devis.router";

// Wiring DI du module devis : assemble le routeur tRPC à partir du repository, des dépendances
// d'envoi par email (artisan/client readers partagés + PdfPort + EmailPort + rate-limiter) et du
// convertisseur devis→facture (cross-domaine), injectés.
export interface DevisModuleDeps {
  readonly repository: IDevisRepository;
  readonly mailing: DevisMailingDeps;
  readonly converter: DevisToFactureConverter;
}

export interface DevisModule {
  readonly deps: DevisModuleDeps;
  readonly router: ReturnType<typeof createDevisRouter>;
}

export function createDevisModule(deps: DevisModuleDeps): DevisModule {
  return { deps, router: createDevisRouter(deps.repository, deps.mailing, deps.converter) };
}

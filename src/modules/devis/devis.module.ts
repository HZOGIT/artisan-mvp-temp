import type { IDevisRepository } from "./application/devis-repository";
import type { DevisMailingDeps } from "./application/envoyer-devis-email";
import type { DevisToFactureConverter } from "./application/devis-to-facture-converter";
import type { IModeleDevisRepository } from "../modeles-devis/application/modele-devis-repository";
import type { IRelanceDevisRepository } from "../relances-devis/application/relance-devis-repository";
import { createDevisRouter } from "./interface/trpc/devis.router";

// Wiring DI du module devis : assemble le routeur tRPC à partir du repository, des dépendances
// d'envoi par email (artisan/client readers partagés + PdfPort + EmailPort + rate-limiter) et du
// convertisseur devis→facture (cross-domaine), injectés.
export interface DevisModuleDeps {
  readonly repository: IDevisRepository;
  readonly mailing: DevisMailingDeps;
  readonly converter: DevisToFactureConverter;
  // Modèles de devis (gabarits) exposés sous `devis.*` (parité client) — repo partagé du domaine modelesDevis.
  readonly modeleRepository: IModeleDevisRepository;
  // Relances de devis exposées sous `devis.*` — repo partagé du domaine relancesDevis.
  readonly relanceRepository: IRelanceDevisRepository;
}

export interface DevisModule {
  readonly deps: DevisModuleDeps;
  readonly router: ReturnType<typeof createDevisRouter>;
}

export function createDevisModule(deps: DevisModuleDeps): DevisModule {
  return {
    deps,
    router: createDevisRouter(deps.repository, deps.mailing, deps.converter, deps.modeleRepository, deps.relanceRepository),
  };
}

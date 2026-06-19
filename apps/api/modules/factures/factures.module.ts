import type { IFactureRepository } from "./application/facture-repository";
import type { IDevisReader } from "./application/devis-reader";
import type { ComptaPort } from "./application/compta-port";
import { NOOP_COMPTA } from "./application/compta-port";
import type { FactureMailingDeps } from "./application/envoyer-facture-email";
import { createFacturesRouter } from "./interface/trpc/factures.router";

/*
 * Wiring DI du module factures : assemble le routeur tRPC à partir du repository, du lecteur de
 * devis (conversion cross-domaine), du port compta (effet de bord FEC) et des dépendances d'envoi
 * par email (artisan/client readers + PDF + email + rate-limit), tous injectés.
 */
export interface FacturesModuleDeps {
  readonly repository: IFactureRepository;
  readonly devisReader: IDevisReader;
  /** Port compta (FEC). Optionnel : no-op tant que le domaine compta n'est pas porté. */
  readonly compta?: ComptaPort;
  /** Composition de l'envoi par email (lecture artisan/client + PdfPort + EmailPort + rate-limiter). */
  readonly mailing: FactureMailingDeps;
}

export interface FacturesModule {
  readonly deps: FacturesModuleDeps;
  readonly router: ReturnType<typeof createFacturesRouter>;
}

export function createFacturesModule(deps: FacturesModuleDeps): FacturesModule {
  return { deps, router: createFacturesRouter(deps.repository, deps.devisReader, deps.compta ?? NOOP_COMPTA, deps.mailing) };
}

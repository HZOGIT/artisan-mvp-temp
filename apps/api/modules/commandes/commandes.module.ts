import type { ICommandeRepository } from "./application/commande-repository";
import type { IFournisseurRepository } from "../fournisseurs/application/fournisseur-repository";
import type { IDevisRepository } from "../devis/application/devis-repository";
import type { CommandeMailingDeps } from "./application/envoyer-commande-email";
import type { CommandeIaDeps } from "./application/generer-depuis-devis-ia";
import type { DbClient } from "../../shared/db";
import { createCommandesRouter } from "./interface/trpc/commandes.router";

/*
 * Wiring DI du module commandes : assemble le routeur tRPC à partir du repository injecté. Repos
 * composés : `fournisseurRepository` (getPerformances = commandes × fournisseurs) ;
 * `devisRepository` (listDevisAcceptes = devis acceptés enrichis du nom client via JOIN) ;
 * `mailing` (envoi du bon de commande par email : artisan reader + PdfPort + EmailPort + rate-limiter).
 */
export interface CommandesModuleDeps {
  readonly repository: ICommandeRepository;
  readonly fournisseurRepository: IFournisseurRepository;
  readonly devisRepository: IDevisRepository;
  readonly mailing: CommandeMailingDeps;
  readonly ia: CommandeIaDeps;
  readonly db?: DbClient;
}

export interface CommandesModule {
  readonly deps: CommandesModuleDeps;
  readonly router: ReturnType<typeof createCommandesRouter>;
}

export function createCommandesModule(deps: CommandesModuleDeps): CommandesModule {
  return {
    deps,
    router: createCommandesRouter(deps.repository, deps.fournisseurRepository, deps.devisRepository, deps.mailing, deps.ia, deps.db),
  };
}

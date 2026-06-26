import type { DbClient } from "../../shared/db";
import type { IDemandeContactRepository } from "./application/demande-contact-repository";
import { createDemandesContactRouter } from "./interface/trpc/demandes-contact.router";

/*
 * Wiring DI du module demandes-contact : assemble le routeur tRPC (CRUD) à partir du repository
 * injecté. ⚠️ Les transitions de statut (marquerContacte/convertir/marquerPerdu) seront ajoutées en 7/9.
 */
export interface DemandesContactModuleDeps {
  readonly repository: IDemandeContactRepository;
  readonly db?: DbClient;
}

export interface DemandesContactModule {
  readonly deps: DemandesContactModuleDeps;
  readonly router: ReturnType<typeof createDemandesContactRouter>;
}

export function createDemandesContactModule(deps: DemandesContactModuleDeps): DemandesContactModule {
  return { deps, router: createDemandesContactRouter(deps.repository, deps.db) };
}

import type { IContratRepository } from "./application/contrat-repository";
import type { ContratFactureGenerator } from "./application/contrat-facture-generator";
import { createContratsMaintenanceRouter } from "./interface/trpc/contrats-maintenance.router";

// Wiring DI du module contrats-maintenance : assemble le routeur tRPC (CRUD + transitions +
// interventions + facturation) à partir du repository et du générateur de facture (cross-domaine) injectés.
export interface ContratsMaintenanceModuleDeps {
  readonly repository: IContratRepository;
  readonly factureGenerator: ContratFactureGenerator;
}

export interface ContratsMaintenanceModule {
  readonly deps: ContratsMaintenanceModuleDeps;
  readonly router: ReturnType<typeof createContratsMaintenanceRouter>;
}

export function createContratsMaintenanceModule(deps: ContratsMaintenanceModuleDeps): ContratsMaintenanceModule {
  return { deps, router: createContratsMaintenanceRouter(deps.repository, deps.factureGenerator) };
}

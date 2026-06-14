import type { IContratRepository } from "./application/contrat-repository";
import { createContratsMaintenanceRouter } from "./interface/trpc/contrats-maintenance.router";

// Wiring DI du module contrats-maintenance : assemble le routeur tRPC (CRUD) à partir du repository
// injecté. ⚠️ Les transitions de statut (suspendre/reactiver/terminer/annuler) seront ajoutées en 7/9.
export interface ContratsMaintenanceModuleDeps {
  readonly repository: IContratRepository;
}

export interface ContratsMaintenanceModule {
  readonly deps: ContratsMaintenanceModuleDeps;
  readonly router: ReturnType<typeof createContratsMaintenanceRouter>;
}

export function createContratsMaintenanceModule(deps: ContratsMaintenanceModuleDeps): ContratsMaintenanceModule {
  return { deps, router: createContratsMaintenanceRouter(deps.repository) };
}

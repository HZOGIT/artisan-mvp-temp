import type { IContratRepository } from "./application/contrat-repository";
import type { ContratFactureGenerator } from "./application/contrat-facture-generator";
import type { IArtisanRepository } from "../artisan/application/artisan-repository";
import { createContratsMaintenanceRouter } from "./interface/trpc/contrats-maintenance.router";

export interface ContratsMaintenanceModuleDeps {
  readonly repository: IContratRepository;
  readonly factureGenerator: ContratFactureGenerator;
  readonly artisanRepo?: IArtisanRepository;
}

export interface ContratsMaintenanceModule {
  readonly deps: ContratsMaintenanceModuleDeps;
  readonly router: ReturnType<typeof createContratsMaintenanceRouter>;
}

export function createContratsMaintenanceModule(deps: ContratsMaintenanceModuleDeps): ContratsMaintenanceModule {
  return { deps, router: createContratsMaintenanceRouter(deps.repository, deps.factureGenerator, deps.artisanRepo) };
}

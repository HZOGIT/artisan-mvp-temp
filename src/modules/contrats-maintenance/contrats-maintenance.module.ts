import type { IContratRepository } from "./application/contrat-repository";

// Wiring DI du module contrats-maintenance. À l'étape scaffold, le module ne porte que ses
// dépendances ; le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface ContratsMaintenanceModuleDeps {
  readonly repository: IContratRepository;
}

export interface ContratsMaintenanceModule {
  readonly deps: ContratsMaintenanceModuleDeps;
}

export function createContratsMaintenanceModule(deps: ContratsMaintenanceModuleDeps): ContratsMaintenanceModule {
  return { deps };
}
